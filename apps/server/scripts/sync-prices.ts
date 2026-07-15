/**
 * Refresh card prices into card_prices. Currently sources prices from the
 * RiftScribe payloads stored in cards.raw_json (run sync-cards first to
 * refresh those). If coverage comes back 0/NNN it prints the payload's
 * actual field names — use that to pin a real price source in
 * apps/server/src/lib/prices.ts.
 */
import { getDb } from '../src/db.js';
import { RawJsonPriceSource, syncPrices } from '../src/lib/prices.js';

const db = getDb();
const result = await syncPrices(db, new RawJsonPriceSource());
console.log(`[prices] priced ${result.priced}/${result.total} cards`);
if (result.sample_fields) {
  console.log('[prices] no price fields found. Payload fields present:');
  for (const field of result.sample_fields) console.log(`  - ${field}`);
  console.log('[prices] → pin a price source in apps/server/src/lib/prices.ts');
}
