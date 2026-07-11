import type { Card } from '@riftvault/types';
import type { Db } from '../db.js';
import { makeCardId, parseCardRef } from './cardId.js';

const CARD_COLS =
  'id, set_code, collector_number, name, type, faction, rarity, image_url';

export function getCard(db: Db, id: string): Card | null {
  return (db.prepare(`SELECT ${CARD_COLS} FROM cards WHERE id = ?`).get(id) as Card) ?? null;
}

export function getCardByRef(db: Db, set_code: string, collector_number: number): Card | null {
  return (
    (db
      .prepare(`SELECT ${CARD_COLS} FROM cards WHERE set_code = ? AND collector_number = ?`)
      .get(set_code.toUpperCase(), collector_number) as Card) ?? null
  );
}

export function allCards(db: Db): Card[] {
  return db.prepare(`SELECT ${CARD_COLS} FROM cards ORDER BY set_code, collector_number`).all() as Card[];
}

/** Escape a user token for an FTS5 prefix query. */
function ftsToken(token: string): string {
  return `"${token.replace(/"/g, '""')}"*`;
}

/**
 * Local fuzzy search: card-ID shortcut first ('ogn-45'), then FTS5 prefix
 * match, then LIKE fallback so a single typo'd token still finds something.
 */
export function searchCards(db: Db, q: string, set?: string, limit = 20): Card[] {
  const query = q.trim();
  if (!query) return [];

  const ref = parseCardRef(query);
  if (ref) {
    const hit = getCard(db, makeCardId(ref.set_code, ref.collector_number)) ??
      getCardByRef(db, ref.set_code, ref.collector_number);
    if (hit) return [hit];
  }

  const tokens = query.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (tokens.length === 0) return [];
  const match = tokens.map(ftsToken).join(' ');
  const setClause = set ? 'AND c.set_code = @set' : '';

  try {
    const rows = db
      .prepare(
        `SELECT ${CARD_COLS.split(', ').map((col) => `c.${col}`).join(', ')}
         FROM cards_fts f JOIN cards c ON c.rowid = f.rowid
         WHERE cards_fts MATCH @match ${setClause}
         ORDER BY rank LIMIT @limit`,
      )
      .all({ match, set: set?.toUpperCase(), limit }) as Card[];
    if (rows.length > 0) return rows;
  } catch {
    // fall through to LIKE on FTS syntax edge cases
  }

  return db
    .prepare(
      `SELECT ${CARD_COLS} FROM cards
       WHERE name LIKE @like ${set ? 'AND set_code = @set' : ''}
       ORDER BY set_code, collector_number LIMIT @limit`,
    )
    .all({ like: `%${query}%`, set: set?.toUpperCase(), limit }) as Card[];
}
