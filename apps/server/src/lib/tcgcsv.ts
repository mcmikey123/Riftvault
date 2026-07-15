import { env } from '../env.js';
import { parseCardRef } from './cardId.js';
import { normalizeName } from './normalize.js';
import type { CardPrice, PriceCardInfo, PriceSource } from './prices.js';

/**
 * Price source backed by tcgcsv.com — a free daily mirror of TCGplayer's
 * public pricing. Riftbound is TCGplayer category 89 (verified 2026-07).
 *
 * Endpoint shapes (standard TCGplayer API mirrored):
 *   /tcgplayer/{cat}/groups            → {results: [{groupId, name, abbreviation}]}
 *   /tcgplayer/{cat}/{group}/products  → {results: [{productId, name, extendedData: [{name:"Number", value:"045/298"}]}]}
 *   /tcgplayer/{cat}/{group}/prices    → {results: [{productId, marketPrice, midPrice, lowPrice, subTypeName:"Normal"|"Foil"}]}
 *
 * Matching: group → set (abbreviation, else group name vs our set display
 * names), product Number → collector number, name as fallback. Prices are
 * USD market prices; Foil sub-type rows become price_foil.
 */

export interface TcgGroup {
  groupId: number;
  name: string;
  abbreviation?: string | null;
}

export interface TcgProduct {
  productId: number;
  name: string;
  extendedData?: { name: string; value: string }[] | null;
}

export interface TcgPriceRow {
  productId: number;
  marketPrice?: number | null;
  midPrice?: number | null;
  lowPrice?: number | null;
  subTypeName?: string | null;
}

export interface CardIndexForPrices {
  byRef: Map<string, string>; // "OGN-45" (unpadded) → card id
  byNormName: Map<string, PriceCardInfo[]>;
  setCodes: Set<string>;
}

export function buildPriceIndex(cards: PriceCardInfo[]): CardIndexForPrices {
  const byRef = new Map<string, string>();
  const byNormName = new Map<string, PriceCardInfo[]>();
  const setCodes = new Set<string>();
  for (const card of cards) {
    byRef.set(`${card.set_code}-${card.collector_number}`, card.id);
    setCodes.add(card.set_code);
    const norm = normalizeName(card.name);
    const list = byNormName.get(norm);
    if (list) list.push(card);
    else byNormName.set(norm, [card]);
  }
  return { byRef, byNormName, setCodes };
}

/** Map a TCGplayer group (set) to one of our set codes, or null. */
export function matchGroupSet(
  group: TcgGroup,
  setCodes: Set<string>,
  setNames: Map<string, string>, // code → display name
): string | null {
  const abbr = group.abbreviation?.trim().toUpperCase();
  if (abbr && setCodes.has(abbr)) return abbr;
  const groupNorm = normalizeName(group.name);
  for (const [code, name] of setNames) {
    if (normalizeName(name) === groupNorm) return code;
  }
  // "Origins Base Set" vs "Origins": prefix match as a last resort
  for (const [code, name] of setNames) {
    const n = normalizeName(name);
    if (n && (groupNorm.startsWith(n) || n.startsWith(groupNorm))) return code;
  }
  return null;
}

/** Extract a collector number (and possibly a set) from a product's extendedData. */
export function productNumber(product: TcgProduct): { set_code?: string; num: number } | null {
  const field = product.extendedData?.find((e) => /^(number|card ?number)$/i.test(e.name));
  if (!field?.value) return null;
  const ref = parseCardRef(field.value);
  if (ref) return { set_code: ref.set_code, num: ref.collector_number };
  const m = field.value.match(/^0*(\d+)/);
  return m ? { num: parseInt(m[1]!, 10) } : null;
}

/** Resolve a TCGplayer product to one of our card ids. Pure, unit-tested. */
export function matchProduct(
  product: TcgProduct,
  groupSet: string | null,
  index: CardIndexForPrices,
): string | null {
  const num = productNumber(product);
  if (num) {
    const set = num.set_code ?? groupSet;
    if (set) {
      const hit = index.byRef.get(`${set.toUpperCase()}-${num.num}`);
      if (hit) return hit;
    }
  }
  // Name fallback: strip trailing parentheticals like "(045/298)" / "(Foil)"
  const cleaned = product.name.replace(/\s*\([^()]*\)\s*$/, '').trim();
  const candidates = index.byNormName.get(normalizeName(cleaned));
  if (!candidates || candidates.length === 0) return null;
  const inSet = groupSet ? candidates.filter((c) => c.set_code === groupSet) : [];
  const pool = inSet.length > 0 ? inSet : candidates;
  const base = [...pool].sort(
    (a, b) => a.set_code.localeCompare(b.set_code) || a.collector_number - b.collector_number,
  )[0]!;
  return base.id;
}

function bestPrice(row: TcgPriceRow): number | null {
  for (const v of [row.marketPrice, row.midPrice, row.lowPrice]) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  }
  return null;
}

export class TcgCsvPriceSource implements PriceSource {
  name = 'tcgcsv';
  private base: string;
  private categoryId: number;
  private setNames: Map<string, string>;

  constructor(
    /** code → display name, from the sets table (helps match TCGplayer groups). */
    setNames: Map<string, string> = new Map(),
    base = env.tcgcsvBase,
    categoryId = env.tcgcsvCategoryId,
  ) {
    this.setNames = setNames;
    this.base = base.replace(/\/$/, '');
    this.categoryId = categoryId;
  }

  private async getResults<T>(path: string): Promise<T[]> {
    const res = await fetch(`${this.base}${path}`, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`GET ${this.base}${path} → ${res.status}`);
    const body = (await res.json()) as { results?: T[] } | T[];
    if (Array.isArray(body)) return body;
    if (Array.isArray(body.results)) return body.results;
    return [];
  }

  async fetchPrices(cards: PriceCardInfo[]): Promise<Map<string, CardPrice>> {
    const index = buildPriceIndex(cards);
    const setNames = this.setNames;

    const groups = await this.getResults<TcgGroup>(`/tcgplayer/${this.categoryId}/groups`);
    if (groups.length === 0) {
      throw new Error('[tcgcsv] no groups returned — category id wrong? Set TCGCSV_CATEGORY_ID');
    }

    const out = new Map<string, CardPrice>();
    for (const group of groups) {
      const groupSet = matchGroupSet(group, index.setCodes, setNames);
      let products: TcgProduct[];
      let priceRows: TcgPriceRow[];
      try {
        [products, priceRows] = await Promise.all([
          this.getResults<TcgProduct>(`/tcgplayer/${this.categoryId}/${group.groupId}/products`),
          this.getResults<TcgPriceRow>(`/tcgplayer/${this.categoryId}/${group.groupId}/prices`),
        ]);
      } catch (err) {
        console.warn(`[tcgcsv] group ${group.name}: ${(err as Error).message} — skipped`);
        continue;
      }

      const priceByProduct = new Map<number, { normal: number | null; foil: number | null }>();
      for (const row of priceRows) {
        const entry = priceByProduct.get(row.productId) ?? { normal: null, foil: null };
        const value = bestPrice(row);
        if (value !== null) {
          if (/foil/i.test(row.subTypeName ?? '')) entry.foil = value;
          else entry.normal = value;
        }
        priceByProduct.set(row.productId, entry);
      }

      let matched = 0;
      for (const product of products) {
        const prices = priceByProduct.get(product.productId);
        if (!prices || (prices.normal === null && prices.foil === null)) continue;
        const cardId = matchProduct(product, groupSet, index);
        if (!cardId) continue;
        const existing = out.get(cardId);
        out.set(cardId, {
          price: prices.normal ?? existing?.price ?? null,
          price_foil: prices.foil ?? existing?.price_foil ?? null,
          currency: 'USD',
        });
        matched++;
      }
      console.log(
        `[tcgcsv] ${group.name}${groupSet ? ` → ${groupSet}` : ''}: matched ${matched}/${products.length} products`,
      );
    }
    return out;
  }
}
