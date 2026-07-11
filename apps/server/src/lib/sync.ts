import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../db.js';
import type { CardSource } from './cardSource/index.js';

export interface SyncResult {
  fetched: number;
  inserted: number;
  updated: number;
}

/** Idempotent upsert of the full card list from a source. */
export async function syncCards(db: Db, source: CardSource): Promise<SyncResult> {
  const cards = await source.fetchAllCards();

  const existing = new Set(
    (db.prepare('SELECT id FROM cards').all() as { id: string }[]).map((r) => r.id),
  );
  const upsert = db.prepare(
    `INSERT INTO cards (id, set_code, collector_number, name, type, faction, rarity, image_url, raw_json)
     VALUES (@id, @set_code, @collector_number, @name, @type, @faction, @rarity, @image_url, @raw_json)
     ON CONFLICT(id) DO UPDATE SET
       set_code = @set_code, collector_number = @collector_number, name = @name,
       type = @type, faction = @faction, rarity = @rarity,
       image_url = @image_url, raw_json = @raw_json`,
  );

  let inserted = 0;
  let updated = 0;
  db.transaction(() => {
    for (const card of cards) {
      upsert.run(card);
      if (existing.has(card.id)) updated++;
      else inserted++;
    }
  })();

  return { fetched: cards.length, inserted, updated };
}

/** Upsert set display names when the source can provide them. */
export async function syncSetNames(db: Db, source: CardSource): Promise<number> {
  if (!source.fetchSets) return 0;
  const sets = await source.fetchSets();
  const upsert = db.prepare(
    `INSERT INTO sets (code, name) VALUES (@code, @name)
     ON CONFLICT(code) DO UPDATE SET name = @name`,
  );
  db.transaction(() => {
    for (const set of sets) upsert.run(set);
  })();
  return sets.length;
}

export interface ProductFixture {
  product_id: string;
  name: string;
  set_code?: string | null;
  cards: { card_id: string; qty: number }[];
}

export interface SeedProductsResult {
  products: number;
  skipped_cards: { product_id: string; card_id: string }[];
}

/** Seed products/product_cards from packages/data/products/*.json fixtures. */
export function seedProducts(db: Db, dir: string): SeedProductsResult {
  const result: SeedProductsResult = { products: 0, skipped_cards: [] };
  if (!fs.existsSync(dir)) return result;

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'));

  const upsertProduct = db.prepare(
    `INSERT INTO products (id, name, set_code) VALUES (@id, @name, @set_code)
     ON CONFLICT(id) DO UPDATE SET name = @name, set_code = @set_code`,
  );
  const clearCards = db.prepare('DELETE FROM product_cards WHERE product_id = ?');
  const insertCard = db.prepare(
    'INSERT INTO product_cards (product_id, card_id, qty) VALUES (?, ?, ?)',
  );
  const cardExists = db.prepare('SELECT 1 FROM cards WHERE id = ?');

  for (const file of files) {
    const fixture = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as ProductFixture;
    if (!fixture.product_id || !fixture.name || !Array.isArray(fixture.cards)) {
      console.warn(`[products] skipping malformed fixture ${file}`);
      continue;
    }
    db.transaction(() => {
      upsertProduct.run({
        id: fixture.product_id,
        name: fixture.name,
        set_code: fixture.set_code ?? null,
      });
      clearCards.run(fixture.product_id);
      for (const { card_id, qty } of fixture.cards) {
        if (!cardExists.get(card_id)) {
          result.skipped_cards.push({ product_id: fixture.product_id, card_id });
          continue;
        }
        insertCard.run(fixture.product_id, card_id, qty);
      }
    })();
    result.products++;
  }
  return result;
}
