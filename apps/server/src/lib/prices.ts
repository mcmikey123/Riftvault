import type { Db } from '../db.js';

/**
 * Price tracking. Prices land in card_prices (one latest price per card)
 * behind a PriceSource interface so the source can change without touching
 * routes/UI.
 *
 * Source #1 extracts prices from the RiftScribe payloads already stored in
 * cards.raw_json — zero extra network. Whether RiftScribe ships price
 * fields wasn't verifiable when this was written, so extraction is
 * tolerant (any numeric field whose path mentions "price") and the sync
 * reports coverage plus a field-name sample when it finds nothing, to
 * guide pinning a real source.
 */

export interface CardPrice {
  price: number | null;
  price_foil: number | null;
  currency: string;
}

export interface PriceSource {
  name: string;
  fetchPrices(cards: { id: string; raw_json: string | null }[]): Promise<Map<string, CardPrice>>;
}

/** Flatten nested objects to dotted paths, shallow arrays included. */
function flatten(value: unknown, path = '', depth = 0): { path: string; value: unknown }[] {
  if (depth > 4 || value === null || value === undefined) return [];
  if (typeof value !== 'object') return [{ path, value }];
  const out: { path: string; value: unknown }[] = [];
  if (Array.isArray(value)) {
    for (let i = 0; i < Math.min(value.length, 10); i++) {
      out.push(...flatten(value[i], `${path}[${i}]`, depth + 1));
    }
    return out;
  }
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out.push(...flatten(v, path ? `${path}.${key}` : key, depth + 1));
  }
  return out;
}

function asPrice(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n < 100000 ? n : null;
}

/**
 * Pure, unit-tested: pull {price, price_foil, currency} out of an arbitrary
 * card payload. Returns null when no price-ish field exists.
 */
export function extractPriceFromRaw(raw: unknown): CardPrice | null {
  const entries = flatten(raw)
    .map(({ path, value }) => ({ path: path.toLowerCase(), value: asPrice(value) }))
    .filter((e): e is { path: string; value: number } => e.value !== null)
    .filter((e) => /price|market/.test(e.path));
  if (entries.length === 0) return null;

  const foil = entries.filter((e) => e.path.includes('foil'));
  const normal = entries.filter((e) => !e.path.includes('foil'));
  // Shortest path wins: 'price' beats 'prices.median_30d' etc.
  const pick = (list: { path: string; value: number }[]) =>
    list.length === 0 ? null : [...list].sort((a, b) => a.path.length - b.path.length)[0]!;

  const normalPick = pick(normal);
  const foilPick = pick(foil);
  if (!normalPick && !foilPick) return null;

  const currencyOf = (path: string | undefined) =>
    !path ? 'USD' : path.includes('eur') || path.includes('cardmarket') ? 'EUR' : 'USD';

  return {
    price: normalPick?.value ?? null,
    price_foil: foilPick?.value ?? null,
    currency: currencyOf(normalPick?.path ?? foilPick?.path),
  };
}

export class RawJsonPriceSource implements PriceSource {
  name = 'riftscribe-raw';

  fetchPrices(cards: { id: string; raw_json: string | null }[]): Promise<Map<string, CardPrice>> {
    const map = new Map<string, CardPrice>();
    for (const card of cards) {
      if (!card.raw_json) continue;
      try {
        const price = extractPriceFromRaw(JSON.parse(card.raw_json));
        if (price) map.set(card.id, price);
      } catch {
        // unparseable payload — skip
      }
    }
    return Promise.resolve(map);
  }
}

export interface PriceSyncResult {
  priced: number;
  total: number;
  sample_fields?: string[];
}

export async function syncPrices(db: Db, source: PriceSource): Promise<PriceSyncResult> {
  const cards = db.prepare('SELECT id, raw_json FROM cards').all() as {
    id: string;
    raw_json: string | null;
  }[];
  const prices = await source.fetchPrices(cards);

  const upsert = db.prepare(
    `INSERT INTO card_prices (card_id, price, price_foil, currency, source, updated_at)
     VALUES (@card_id, @price, @price_foil, @currency, @source, @updated_at)
     ON CONFLICT(card_id) DO UPDATE SET
       price = @price, price_foil = @price_foil, currency = @currency,
       source = @source, updated_at = @updated_at`,
  );
  const now = new Date().toISOString();
  db.transaction(() => {
    for (const [card_id, p] of prices) {
      upsert.run({
        card_id,
        price: p.price,
        price_foil: p.price_foil,
        currency: p.currency,
        source: source.name,
        updated_at: now,
      });
    }
  })();

  const result: PriceSyncResult = { priced: prices.size, total: cards.length };
  if (prices.size === 0 && cards.length > 0) {
    // Help diagnose: what fields DOES the payload have?
    try {
      const sample = JSON.parse(cards[0]!.raw_json ?? '{}');
      result.sample_fields = flatten(sample).map((e) => e.path).slice(0, 40);
    } catch {
      /* ignore */
    }
  }
  return result;
}
