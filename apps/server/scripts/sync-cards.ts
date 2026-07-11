import { getDb } from '../src/db.js';
import { env } from '../src/env.js';
import { getCardSource } from '../src/lib/cardSource/index.js';
import { seedProducts, syncCards } from '../src/lib/sync.js';

const db = getDb();
const source = await getCardSource(env.cardSource, env.riftscribeBase);

console.log(`[sync] source: ${source.name}`);
const result = await syncCards(db, source);
console.log(
  `[sync] fetched ${result.fetched} cards — ${result.inserted} new, ${result.updated} updated`,
);

const products = seedProducts(db, env.productsDir);
console.log(`[sync] seeded ${products.products} product fixture(s)`);
for (const skip of products.skipped_cards) {
  console.warn(`[sync] product ${skip.product_id}: unknown card ${skip.card_id} — skipped`);
}

const sets = db
  .prepare('SELECT set_code, COUNT(*) AS n FROM cards GROUP BY set_code ORDER BY set_code')
  .all() as { set_code: string; n: number }[];
for (const s of sets) console.log(`[sync]   ${s.set_code}: ${s.n} cards`);
