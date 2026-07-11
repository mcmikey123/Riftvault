import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../db.js';
import type { CardSource } from './cardSource/index.js';
import { SET_NAMES } from './setNames.js';

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

/**
 * Upsert set display names. Real names from the source win; otherwise the
 * curated SET_NAMES map fills in. Codes with no name anywhere are left out
 * of the table (the UI falls back to showing the code) and warned about.
 */
export async function syncSetNames(db: Db, source: CardSource): Promise<number> {
  const fromSource = source.fetchSets ? await source.fetchSets() : [];
  // A "name" identical to the code is not a name (the filters endpoint
  // returns bare codes).
  const sourceNames = new Map(
    fromSource
      .filter((s) => s.name && s.name.toUpperCase() !== s.code.toUpperCase())
      .map((s) => [s.code, s.name]),
  );
  const codes = new Set<string>([
    ...fromSource.map((s) => s.code),
    ...(db.prepare('SELECT DISTINCT set_code FROM cards').all() as { set_code: string }[]).map(
      (r) => r.set_code,
    ),
  ]);

  const upsert = db.prepare(
    `INSERT INTO sets (code, name) VALUES (@code, @name)
     ON CONFLICT(code) DO UPDATE SET name = @name`,
  );
  let named = 0;
  db.transaction(() => {
    for (const code of codes) {
      const name = sourceNames.get(code) ?? SET_NAMES[code];
      if (!name) {
        // Scrub code-as-name rows left by earlier syncs; the UI shows the
        // code on its own until a real name exists.
        db.prepare('DELETE FROM sets WHERE code = ? AND name = ?').run(code, code);
        console.warn(
          `[sync] no display name for set ${code} — add it to apps/server/src/lib/setNames.ts`,
        );
        continue;
      }
      upsert.run({ code, name });
      named++;
    }
  })();
  return named;
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
