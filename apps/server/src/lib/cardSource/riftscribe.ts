import { makeCardId, parseCardRef } from '../cardId.js';
import type { CardSource, SourceCard, SourceSet } from './index.js';

/**
 * RiftScribe (https://riftscribe.gg) sync client. Open REST, no auth.
 *
 * Verified against the live OpenAPI spec on 2026-07-11:
 *   GET /api/cards
 *     limit  (int, 1..200, default 48)
 *     offset (int, >=0, default 0)
 *     plus filters: q, set_id, faction, rarity, type, is_banned, sort
 *   → bare JSON array of cards, no envelope/total. Paginate by offset until
 *     a short page.
 *
 * Card shape (fields we use):
 *   { id: "ogn-001-298", name, set_id: "OGN", collector_number: 1,
 *     variant: "", rarity, faction, type,
 *     image: <original png>, image_thumb: { small, medium } }
 *
 * Variants (alt arts) share a collector number; the vault schema is
 * UNIQUE(set_code, collector_number), so the base printing (variant === "")
 * wins a collision and variant rows are dropped. Full payloads land in
 * raw_json, so nothing is lost if that policy changes later.
 */
export class RiftScribeSource implements CardSource {
  name = 'riftscribe';
  private base: string;

  constructor(base = 'https://riftscribe.gg') {
    this.base = base.replace(/\/$/, '');
  }

  async fetchAllCards(): Promise<SourceCard[]> {
    const endpoint = `${this.base}/api/cards`;
    console.log(`[riftscribe] using list endpoint: ${endpoint}`);

    const LIMIT = 200;
    const byId = new Map<string, SourceCard>();
    const variantIds = new Set<string>(); // ids currently holding a non-base printing
    let offset = 0;

    for (;;) {
      const items = await this.getJson(`${endpoint}?limit=${LIMIT}&offset=${offset}`);
      if (!Array.isArray(items)) {
        throw new Error(
          '[riftscribe] expected a JSON array from /api/cards — API shape changed? ' +
            `Check ${this.base}/openapi.json and update riftscribe.ts`,
        );
      }
      if (items.length === 0) break;

      for (const item of items as Record<string, unknown>[]) {
        const card = mapCard(item);
        if (!card) continue;
        const isBase = !item.variant;
        const existing = byId.get(card.id);
        if (!existing || (isBase && variantIds.has(card.id))) {
          byId.set(card.id, card);
          if (isBase) variantIds.delete(card.id);
          else variantIds.add(card.id);
        }
      }

      offset += items.length;
      if (items.length < LIMIT) break;
      if (offset > 100_000) throw new Error('[riftscribe] pagination ran away (>100k cards)');
    }

    if (byId.size === 0) {
      throw new Error(
        '[riftscribe] no cards could be mapped — API shape changed? ' +
          `Check ${this.base}/openapi.json and update mapCard() in riftscribe.ts`,
      );
    }
    console.log(`[riftscribe] fetched ${byId.size} cards (scanned ${offset} rows incl. variants)`);
    return [...byId.values()];
  }

  /**
   * Set display names from GET /api/cards/filters. That endpoint exists in
   * the OpenAPI spec but its response shape wasn't verifiable when this was
   * written, so parsing is tolerant and a failure is non-fatal — the UI
   * falls back to set codes.
   */
  async fetchSets(): Promise<SourceSet[]> {
    try {
      const body = await this.getJson(`${this.base}/api/cards/filters`);
      const sets = parseSetsPayload(body);
      if (sets.length === 0) {
        console.warn(
          '[riftscribe] /api/cards/filters returned no recognisable sets — ' +
            `inspect it and update parseSetsPayload(): ${JSON.stringify(body).slice(0, 200)}`,
        );
      }
      return sets;
    } catch (err) {
      console.warn(`[riftscribe] set names unavailable: ${(err as Error).message}`);
      return [];
    }
  }

  private async getJson(url: string): Promise<unknown> {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      // FastAPI explains validation failures in the body — surface that.
      let detail = '';
      try {
        detail = ` ${(await res.text()).slice(0, 300)}`;
      } catch {
        /* body unavailable */
      }
      throw new Error(`GET ${url} → ${res.status}${detail}`);
    }
    return res.json();
  }
}

/** Find set {code, name} pairs in whatever envelope the filters endpoint uses. */
export function parseSetsPayload(body: unknown): SourceSet[] {
  const containers: unknown[] = [body];
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const obj = body as Record<string, unknown>;
    containers.push(obj.filters, obj.data);
  }

  for (const container of containers) {
    if (!container || typeof container !== 'object') continue;
    const obj = container as Record<string, unknown>;
    for (const key of ['sets', 'set', 'set_ids', 'series', 'expansions']) {
      const list = obj[key];
      if (!Array.isArray(list) || list.length === 0) continue;
      const out: SourceSet[] = [];
      for (const item of list) {
        if (typeof item === 'string' && item.trim()) {
          out.push({ code: item.trim().toUpperCase(), name: item.trim() });
        } else if (item && typeof item === 'object') {
          const o = item as Record<string, unknown>;
          const code = firstStr(o.id, o.code, o.set_id, o.value, o.key);
          if (!code) continue;
          const name = firstStr(o.name, o.label, o.title, o.text) ?? code;
          out.push({ code: code.toUpperCase(), name });
        }
      }
      if (out.length > 0) return out;
    }
  }
  return [];
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function firstStr(...vals: unknown[]): string | null {
  for (const v of vals) {
    const s = str(v);
    if (s) return s;
  }
  return null;
}

/** Collector numbers may arrive as 45, '045', or '045/298'. */
function toCollectorNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = v.match(/^0*(\d+)/);
    if (m) return parseInt(m[1]!, 10);
  }
  return null;
}

export function mapCard(item: Record<string, unknown>): SourceCard | null {
  const rawId = firstStr(item.id, item.card_id);

  // Verified field names first, tolerant fallbacks after.
  let set_code = firstStr(item.set_id, item.set_code, item.setCode);
  let collector_number = toCollectorNumber(item.collector_number ?? item.collectorNumber ?? item.number);

  // Fall back to parsing the ID ('ogn-001-298' → OGN, 1)
  if ((!set_code || collector_number == null) && rawId) {
    const ref = parseCardRef(rawId);
    if (ref) {
      set_code = set_code ?? ref.set_code;
      collector_number = collector_number ?? ref.collector_number;
    }
  }

  const name = firstStr(item.name, item.card_name);
  if (!set_code || collector_number == null || !name) return null;

  // Prefer the CDN thumbnails (we re-encode to ~300px anyway); the original
  // PNG is a last resort — it's an order of magnitude heavier.
  const thumbs = (item.image_thumb ?? null) as Record<string, unknown> | null;
  const image_url = firstStr(
    thumbs ? thumbs.medium : null,
    thumbs ? thumbs.small : null,
    thumbs ? thumbs.large : null,
    item.image,
    item.image_url,
  );

  const factionRaw = item.faction ?? item.domain ?? item.domains;
  const faction = Array.isArray(factionRaw)
    ? factionRaw.filter((f) => typeof f === 'string').join('/') || null
    : firstStr(factionRaw);

  return {
    id: makeCardId(set_code, collector_number),
    set_code: set_code.toUpperCase(),
    collector_number,
    name,
    type: firstStr(item.type, item.card_type),
    faction,
    rarity: firstStr(item.rarity),
    image_url,
    raw_json: JSON.stringify(item),
  };
}
