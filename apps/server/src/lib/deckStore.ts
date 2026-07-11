import type { Card } from '@riftvault/types';
import type { Db } from '../db.js';

export interface DeckUpsert {
  name: string;
  kind: 'mine' | 'meta';
  source_url: string;
  archetype: string | null;
  popularity_rank: number | null;
  source_text: string;
  cards: { card: Card; qty: number }[];
  unresolved: string[];
}

/**
 * Insert or refresh a deck keyed by source_url, so re-importing the same
 * PA deck updates its rank/list instead of duplicating it.
 */
export function upsertDeckBySourceUrl(db: Db, deck: DeckUpsert): { id: number; created: boolean } {
  const now = new Date().toISOString();
  return db.transaction(() => {
    const existing = db
      .prepare('SELECT id FROM decks WHERE source_url = ?')
      .get(deck.source_url) as { id: number } | undefined;

    let id: number;
    if (existing) {
      id = existing.id;
      db.prepare(
        `UPDATE decks SET name = ?, kind = ?, archetype = ?, popularity_rank = ?,
         source_text = ?, unresolved_json = ?, updated_at = ? WHERE id = ?`,
      ).run(
        deck.name,
        deck.kind,
        deck.archetype,
        deck.popularity_rank,
        deck.source_text,
        JSON.stringify(deck.unresolved),
        now,
        id,
      );
      db.prepare('DELETE FROM deck_cards WHERE deck_id = ?').run(id);
    } else {
      const info = db
        .prepare(
          `INSERT INTO decks (name, kind, source_url, archetype, popularity_rank, source_text, unresolved_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          deck.name,
          deck.kind,
          deck.source_url,
          deck.archetype,
          deck.popularity_rank,
          deck.source_text,
          JSON.stringify(deck.unresolved),
          now,
        );
      id = Number(info.lastInsertRowid);
    }

    const insert = db.prepare('INSERT INTO deck_cards (deck_id, card_id, qty) VALUES (?, ?, ?)');
    for (const { card, qty } of deck.cards) insert.run(id, card.id, qty);
    return { id, created: !existing };
  })();
}
