import { Hono } from 'hono';
import type { Card, DeckDiff } from '@riftvault/types';
import type { Db } from '../db.js';
import { findImportSource } from '../lib/deckImport.js';
import { parseDecklist } from '../lib/parseDecklist.js';
import { resolveDeckEntries } from '../lib/resolveDeck.js';
import { getCard } from '../lib/search.js';
import type { User } from '../lib/users.js';

interface DeckRow {
  id: number;
  user_id: number | null;
  name: string;
  kind: string;
  source_url: string | null;
  archetype: string | null;
  popularity_rank: number | null;
  source_text: string;
  unresolved_json: string;
  created_at: string;
  updated_at: string | null;
}

type AppEnv = { Variables: { user: User } };

export function deckToJson(db: Db, row: DeckRow) {
  const count = db
    .prepare('SELECT COALESCE(SUM(qty), 0) AS n FROM deck_cards WHERE deck_id = ?')
    .get(row.id) as { n: number };
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    source_url: row.source_url,
    archetype: row.archetype,
    popularity_rank: row.popularity_rank,
    source_text: row.source_text,
    created_at: row.created_at,
    updated_at: row.updated_at,
    card_count: count.n,
    unresolved: JSON.parse(row.unresolved_json) as string[],
  };
}

/** Deck requirements vs ONE user's vault (foils count toward owned). */
export function deckRequirements(db: Db, deckId: number, userId: number) {
  return db
    .prepare(
      `SELECT dc.qty AS need,
              COALESCE(v.qty, 0) + COALESCE(v.qty_foil, 0) AS have,
              c.id, c.set_code, c.collector_number, c.name, c.type, c.faction, c.rarity, c.image_url
       FROM deck_cards dc
       JOIN cards c ON c.id = dc.card_id
       LEFT JOIN vault v ON v.card_id = dc.card_id AND v.user_id = ?
       WHERE dc.deck_id = ?
       ORDER BY c.set_code, c.collector_number`,
    )
    .all(userId, deckId) as (Card & { need: number; have: number })[];
}

/** Meta decks are shared; personal decks are visible to their owner only. */
function visibleDeck(db: Db, id: number | string, userId: number): DeckRow | null {
  const row = db.prepare('SELECT * FROM decks WHERE id = ?').get(id) as DeckRow | undefined;
  if (!row) return null;
  if (row.kind !== 'meta' && row.user_id !== userId) return null;
  return row;
}

export function decksRoutes(db: Db) {
  const app = new Hono<AppEnv>();

  app.get('/decks', (c) => {
    const rows = db
      .prepare(
        `SELECT * FROM decks WHERE kind = 'meta' OR user_id = ?
         ORDER BY kind, popularity_rank IS NULL, popularity_rank, name`,
      )
      .all(c.get('user').id) as DeckRow[];
    return c.json(rows.map((r) => deckToJson(db, r)));
  });

  app.get('/decks/:id', (c) => {
    const row = visibleDeck(db, c.req.param('id'), c.get('user').id);
    if (!row) return c.json({ error: 'not found' }, 404);
    const deck = deckToJson(db, row);
    const cards = deckRequirements(db, row.id, c.get('user').id).map(
      ({ need, have, ...card }) => ({ card, qty: need }),
    );
    return c.json({ ...deck, cards });
  });

  app.post('/decks', async (c) => {
    const body = (await c.req.json()) as {
      name?: string;
      kind?: string;
      text?: string;
      url?: string;
      archetype?: string;
      popularity_rank?: number;
    };
    const kind = body.kind === 'meta' ? 'meta' : 'mine';

    let text = body.text?.trim() ?? '';
    let name = body.name?.trim() || null;
    let archetype = body.archetype?.trim() || null;
    const sourceUrl = body.url?.trim() || null;

    if (!text && sourceUrl) {
      const source = findImportSource(sourceUrl);
      if (!source) {
        return c.json(
          { error: 'no importer for that URL — paste the decklist text instead' },
          400,
        );
      }
      try {
        const imported = await source.fetchDeck(sourceUrl);
        text = imported.text;
        name = name ?? imported.name;
        archetype = archetype ?? imported.archetype;
      } catch (err) {
        return c.json({ error: (err as Error).message }, 502);
      }
    }
    if (!text) return c.json({ error: 'text or url required' }, 400);

    const parsed = parseDecklist(text);
    if (parsed.entries.length === 0) {
      return c.json({ error: 'no cards found in decklist', unparsed: parsed.unparsed }, 400);
    }
    const resolved = resolveDeckEntries(db, parsed.entries);
    const unresolved = [...parsed.unparsed, ...resolved.unresolved];
    const now = new Date().toISOString();
    // Meta decks are shared (user_id NULL); personal decks belong to the creator.
    const ownerId = kind === 'meta' ? null : c.get('user').id;

    const deckId = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO decks (user_id, name, kind, source_url, archetype, popularity_rank, source_text, unresolved_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          ownerId,
          name ?? `Imported deck ${now.slice(0, 10)}`,
          kind,
          sourceUrl,
          archetype,
          body.popularity_rank ?? null,
          text,
          JSON.stringify(unresolved),
          now,
        );
      const id = Number(info.lastInsertRowid);
      const insert = db.prepare('INSERT INTO deck_cards (deck_id, card_id, qty) VALUES (?, ?, ?)');
      for (const { card, qty } of resolved.cards.values()) insert.run(id, card.id, qty);
      return id;
    })();

    const row = db.prepare('SELECT * FROM decks WHERE id = ?').get(deckId) as DeckRow;
    return c.json(deckToJson(db, row), 201);
  });

  app.delete('/decks/:id', (c) => {
    const row = visibleDeck(db, c.req.param('id'), c.get('user').id);
    if (!row) return c.json({ error: 'not found' }, 404);
    db.transaction(() => {
      db.prepare('DELETE FROM deck_cards WHERE deck_id = ?').run(row.id);
      db.prepare('DELETE FROM decks WHERE id = ?').run(row.id);
    })();
    return c.json({ ok: true });
  });

  /** Manual fixing of unresolved lines: upsert one card into the deck. */
  app.post('/decks/:id/cards', async (c) => {
    const row = visibleDeck(db, c.req.param('id'), c.get('user').id);
    if (!row) return c.json({ error: 'not found' }, 404);
    const body = (await c.req.json()) as { card_id?: string; qty?: number; resolves_line?: string };
    if (!body.card_id || !Number.isInteger(body.qty)) {
      return c.json({ error: 'card_id and integer qty required' }, 400);
    }
    if (!getCard(db, body.card_id)) return c.json({ error: 'unknown card' }, 400);

    db.transaction(() => {
      if (body.qty! <= 0) {
        db.prepare('DELETE FROM deck_cards WHERE deck_id = ? AND card_id = ?').run(
          row.id,
          body.card_id,
        );
      } else {
        db.prepare(
          `INSERT INTO deck_cards (deck_id, card_id, qty) VALUES (?, ?, ?)
           ON CONFLICT(deck_id, card_id) DO UPDATE SET qty = excluded.qty`,
        ).run(row.id, body.card_id, body.qty);
      }
      if (body.resolves_line) {
        const unresolved = (JSON.parse(row.unresolved_json) as string[]).filter(
          (line) => line !== body.resolves_line,
        );
        db.prepare('UPDATE decks SET unresolved_json = ?, updated_at = ? WHERE id = ?').run(
          JSON.stringify(unresolved),
          new Date().toISOString(),
          row.id,
        );
      }
    })();

    const updated = db.prepare('SELECT * FROM decks WHERE id = ?').get(row.id) as DeckRow;
    return c.json(deckToJson(db, updated));
  });

  app.get('/decks/:id/diff', (c) => {
    const row = visibleDeck(db, c.req.param('id'), c.get('user').id);
    if (!row) return c.json({ error: 'not found' }, 404);

    const reqs = deckRequirements(db, row.id, c.get('user').id);
    const have: DeckDiff['have'] = [];
    const missing: DeckDiff['missing'] = [];
    let total_missing = 0;
    let total_need = 0;
    let owned = 0;
    for (const { need, have: rawHave, ...card } of reqs) {
      total_need += need;
      owned += Math.min(rawHave, need);
      if (rawHave >= need) have.push({ card, need, have: rawHave });
      else {
        missing.push({ card, need, have: rawHave });
        total_missing += need - rawHave;
      }
    }
    const diff: DeckDiff = {
      deck: { id: row.id, name: row.name, kind: row.kind },
      have,
      missing,
      total_missing,
      total_need,
      completion: total_need === 0 ? 0 : owned / total_need,
    };
    return c.json(diff);
  });

  return app;
}
