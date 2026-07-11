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
    const byId = new Map<string, SourceCard>();
    let expectedTotal: number | null = null;

    // The API's pagination scheme is unverified, so don't assume one. The
    // server validates query params (422 on out-of-range values) but ignores
    // unknown ones, so: try a bare `page` first (server-default page size),
    // then common size-param styles at modest sizes. A style that errors is
    // skipped, not fatal. Keep requesting pages while they yield NEW cards;
    // an EMPTY page is authoritative end-of-catalogue and stops all probing.
    // De-duping by card ID makes every scheme safe to probe.
    const styles: ((page: number) => Record<string, string>)[] = [
      (p) => ({ page: String(p) }),
      (p) => ({ page: String(p), page_size: '100' }),
      (p) => ({ page: String(p), pageSize: '100' }),
      (p) => ({ page: String(p), per_page: '100' }),
      (p) => ({ page: String(p), limit: '100' }),
      (p) => ({ page: String(p), limit: '50' }),
      (p) => ({ offset: String((p - 1) * 50), limit: '50' }),
    ];

    let sawEmptyPage = false;
    for (const style of styles) {
      let page = 1;
      let nextUrl: string | null = null;
      let styleFailed = false;
      for (;;) {
        let url: string;
        if (nextUrl) {
          url = nextUrl;
        } else {
          const u = new URL(endpoint);
          for (const [k, v] of Object.entries(style(page))) u.searchParams.set(k, v);
          url = u.toString();
        }
        let body: unknown;
        try {
          body = await this.getJson(url);
        } catch (err) {
          console.warn(`[riftscribe] ${(err as Error).message} — skipping this param style`);
          styleFailed = true;
          break;
        }
        expectedTotal ??= extractTotal(body);
        const items = extractItems(body);
        if (!items || items.length === 0) {
          sawEmptyPage = page > 1; // the server itself said "no more"
          break;
        }
        let added = 0;
        for (const item of items) {
          const card = mapCard(item);
          if (card && !byId.has(card.id)) {
            byId.set(card.id, card);
            added++;
          }
        }
        if (added === 0) break; // page param ignored, or we're past the end
        nextUrl = extractNext(body, endpoint);
        page++;
        if (page > 400) throw new Error('[riftscribe] pagination ran away (>400 pages)');
      }
      if (styleFailed) continue;
      if (sawEmptyPage) break;
      if (expectedTotal !== null && byId.size >= expectedTotal) break;
    }

    if (byId.size === 0) {
      throw new Error(
        '[riftscribe] endpoint responded but no cards could be mapped — API shape ' +
          'changed? Inspect the response and update mapCard() in riftscribe.ts',
      );
    }
    if (expectedTotal !== null && byId.size < expectedTotal) {
      console.warn(
        `[riftscribe] WARNING: fetched ${byId.size} of ${expectedTotal} reported cards — ` +
          'pagination scheme not fully cracked. Inspect the list endpoint response ' +
          'and update fetchAllCards() in riftscribe.ts.',
      );
    }
    console.log(
      `[riftscribe] fetched ${byId.size} cards${expectedTotal !== null ? ` (API reports ${expectedTotal})` : ''}`,
    );
    return [...byId.values()];
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
    if (!res.ok) {
      // FastAPI-style servers explain validation failures in the body —
      // surface that instead of a bare status code.
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

/** Pull a reported total card count out of common response envelopes. */
function extractTotal(body: unknown): number | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;
  const nests = [obj, obj.meta, obj.pagination, obj.page_info, obj.pageInfo];
  for (const nest of nests) {
    if (!nest || typeof nest !== 'object') continue;
    const n = nest as Record<string, unknown>;
    for (const key of ['total', 'totalCount', 'total_count', 'totalItems', 'total_items']) {
      const v = n[key];
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
    }
  }
  return null;
}

/** Follow `next` pagination links when the API offers them. */
function extractNext(body: unknown, base: string): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;
  const nests = [obj, obj.meta, obj.pagination, obj.links];
  for (const nest of nests) {
    if (!nest || typeof nest !== 'object') continue;
    const n = nest as Record<string, unknown>;
    for (const key of ['next', 'nextPage', 'next_page', 'next_url']) {
      const v = n[key];
      if (typeof v === 'string' && v) {
        try {
          return new URL(v, base).toString();
        } catch {
          return null;
        }
      }
    }
  }
  return null;
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
