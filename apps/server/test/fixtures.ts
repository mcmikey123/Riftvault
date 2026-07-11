import type { Card } from '@riftvault/types';
import { createDb, type Db } from '../src/db.js';
import { makeCardId } from '../src/lib/cardId.js';

let counter = 0;

export function makeCard(partial: Partial<Card> & { name: string }): Card {
  counter++;
  const set_code = partial.set_code ?? 'OGN';
  const collector_number = partial.collector_number ?? counter;
  return {
    id: partial.id ?? makeCardId(set_code, collector_number),
    set_code,
    collector_number,
    name: partial.name,
    type: partial.type ?? 'Unit',
    faction: partial.faction ?? 'Fury',
    rarity: partial.rarity ?? 'common',
    image_url: partial.image_url ?? null,
  };
}

export const FIXTURE_CARDS: Card[] = [
  makeCard({ set_code: 'OGN', collector_number: 45, name: 'Void Gate', rarity: 'rare' }),
  makeCard({ set_code: 'OGN', collector_number: 67, name: 'Jinx, Loose Cannon', rarity: 'epic' }),
  makeCard({ set_code: 'OGN', collector_number: 112, name: 'Piltover Peacemaker', rarity: 'common' }),
  makeCard({ set_code: 'OGN', collector_number: 203, name: 'Hextech Forge', rarity: 'uncommon' }),
  makeCard({ set_code: 'OGN', collector_number: 8, name: 'Arcane Surge', rarity: 'common' }),
  makeCard({ set_code: 'OGN', collector_number: 9, name: 'Arcane Sight', rarity: 'common' }),
  // Reprint of Void Gate in a later set (multiple printings case)
  makeCard({ set_code: 'SFR', collector_number: 12, name: 'Void Gate', rarity: 'rare' }),
  makeCard({ set_code: 'SFR', collector_number: 30, name: "Kai'Sa, Daughter of the Void", rarity: 'legendary' }),
  makeCard({ set_code: 'SFR', collector_number: 31, name: 'Shadow Isles Wraith', rarity: 'common' }),
];

export function seedDb(cards: Card[] = FIXTURE_CARDS): Db {
  const db = createDb(':memory:');
  const insert = db.prepare(
    `INSERT INTO cards (id, set_code, collector_number, name, type, faction, rarity, image_url, raw_json)
     VALUES (@id, @set_code, @collector_number, @name, @type, @faction, @rarity, @image_url, '{}')`,
  );
  for (const card of cards) insert.run(card);
  return db;
}
