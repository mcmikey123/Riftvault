import { makeCardId, parseCardRef } from '../cardId.js';
import type { CardSource, SourceCard } from './index.js';

/**
 * RiftScribe (https://riftscribe.gg) sync client. Open REST, no auth.
 *
 * NOTE: the live OpenAPI spec (https://riftscribe.gg/openapi.json) was not
 * reachable from the environment this client was written in, so both the
 * endpoint path and the field mapping are deliberately tolerant: several
 * list-endpoint shapes are probed, and every plausible field spelling is
 * accepted. On your first `npm run sync-cards`, check the logged endpoint +
 * a spot-check of a few cards against riftscribe.gg, and tighten
 * `mapCard()` if the real schema disagrees. Full payloads are kept in
 * `raw_json` so re-mapping later is lossless.
 */
export class RiftScribeSource implements CardSource {
  name = 'riftscribe';
  private base: string;

  constructor(base = 'https://riftscribe.gg') {
    this.base = base.replace(/\/$/, '');
  }

  async fetchAllCards(): Promise<SourceCard[]> {
    const endpoint = await this.findListEndpoint();
    console.log(`[riftscribe] using list endpoint: ${endpoint}`);
    const out: SourceCard[] = [];
    const seen = new Set<string>();
    let page = 1;
    // Paginate until a page comes back empty/short; tolerate APIs that
    // ignore the page param by de-duping and stopping on no-new-cards.
    for (;;) {
      const url = new URL(endpoint);
      url.searchParams.set('page', String(page));
      url.searchParams.set('pageSize', '250');
      const body = await this.getJson(url.toString());
      const items = extractItems(body);
      if (!items || items.length === 0) break;
      let added = 0;
      for (const item of items) {
        const card = mapCard(item);
        if (!card) continue;
        if (seen.has(card.id)) continue;
        seen.add(card.id);
        out.push(card);
        added++;
      }
      if (added === 0) break; // API ignored pagination — one full dump
      if (items.length < 250 && page > 1) break;
      if (items.length < 250 && page === 1) break;
      page++;
      if (page > 200) throw new Error('[riftscribe] pagination ran away (>200 pages)');
    }
    if (out.length === 0) {
      throw new Error(
        '[riftscribe] endpoint responded but no cards could be mapped — API shape ' +
          'changed? Inspect the response and update mapCard() in riftscribe.ts',
      );
    }
    return out;
  }

  private async findListEndpoint(): Promise<string> {
    const candidates = [
      `${this.base}/api/cards`,
      `${this.base}/api/v1/cards`,
      `${this.base}/cards.json`,
    ];
    for (const url of candidates) {
      try {
        const body = await this.getJson(`${url}?page=1&pageSize=1`);
        if (extractItems(body)) return url;
      } catch {
        // try the next candidate
      }
    }
    throw new Error(
      `[riftscribe] no card list endpoint found at ${this.base} — check ` +
        `${this.base}/openapi.json and set RIFTSCRIBE_BASE / update riftscribe.ts`,
    );
  }

  private async getJson(url: string): Promise<unknown> {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
    return res.json();
  }
}

function extractItems(body: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    for (const key of ['data', 'cards', 'items', 'results']) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
  }
  return null;
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
  const setObj = (item.set ?? null) as Record<string, unknown> | null;
  const rawId = firstStr(item.id, item.card_id, item.cardId, item.code);

  let set_code = firstStr(
    item.set_code,
    item.setCode,
    setObj && typeof setObj === 'object' ? setObj.code : null,
    setObj && typeof setObj === 'object' ? setObj.id : null,
    typeof item.set === 'string' ? item.set : null,
  );
  let collector_number = toCollectorNumber(
    item.collector_number ?? item.collectorNumber ?? item.number ?? item.num,
  );

  // Fall back to parsing the ID ('OGN-001-298', 'OGN-045'…)
  if ((!set_code || collector_number == null) && rawId) {
    const ref = parseCardRef(rawId);
    if (ref) {
      set_code = set_code ?? ref.set_code;
      collector_number = collector_number ?? ref.collector_number;
    }
  }

  const name = firstStr(item.name, item.card_name, item.title);
  if (!set_code || collector_number == null || !name) return null;

  const images = (item.images ?? null) as Record<string, unknown> | null;
  const image_url = firstStr(
    item.image_url,
    item.imageUrl,
    item.image,
    images ? images.full : null,
    images ? images.normal : null,
    images ? images.large : null,
    images ? images.png : null,
    images ? images.small : null,
  );

  const factionRaw = item.faction ?? item.domain ?? item.domains ?? item.color;
  const faction = Array.isArray(factionRaw)
    ? factionRaw.filter((f) => typeof f === 'string').join('/') || null
    : firstStr(factionRaw);

  return {
    id: makeCardId(set_code, collector_number),
    set_code: set_code.toUpperCase(),
    collector_number,
    name,
    type: firstStr(item.type, item.card_type, item.cardType, item.supertype),
    faction,
    rarity: firstStr(item.rarity),
    image_url,
    raw_json: JSON.stringify(item),
  };
}
