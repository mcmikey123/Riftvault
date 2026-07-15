/**
 * Refresh card prices into card_prices. Default source is tcgcsv.com — a
 * free daily mirror of TCGplayer's market prices (Riftbound = category 89).
 * Override with PRICE_SOURCE=raw to extract from stored RiftScribe payloads
 * instead (they carry no prices as of 2026-07, kept for completeness).
 */
import { getDb } from '../src/db.js';
import { env } from '../src/env.js';
import { getPriceSource, syncPrices } from '../src/lib/prices.js';

const db = getDb();
const source = await getPriceSource(db, env.priceSource);
console.log(`[prices] source: ${source.name}`);
const result = await syncPrices(db, source);
console.log(`[prices] priced ${result.priced}/${result.total} cards`);
if (result.priced === 0) {
  console.log('[prices] nothing priced — check the log above for group/product match details');
}
