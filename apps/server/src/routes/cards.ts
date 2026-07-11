import { Hono } from 'hono';
import type { Db } from '../db.js';
import { searchCards } from '../lib/search.js';

export function cardsRoutes(db: Db) {
  const app = new Hono();

  app.get('/sets', (c) => {
    const rows = db
      .prepare(
        `SELECT c.set_code,
                COUNT(*) AS card_count,
                COUNT(CASE WHEN COALESCE(v.qty,0) + COALESCE(v.qty_foil,0) > 0 THEN 1 END) AS owned_unique,
                COALESCE(SUM(COALESCE(v.qty,0) + COALESCE(v.qty_foil,0)), 0) AS owned_total
         FROM cards c LEFT JOIN vault v ON v.card_id = c.id
         GROUP BY c.set_code ORDER BY c.set_code`,
      )
      .all() as {
      set_code: string;
      card_count: number;
      owned_unique: number;
      owned_total: number;
    }[];
    return c.json(
      rows.map((r) => ({ ...r, completion: r.card_count ? r.owned_unique / r.card_count : 0 })),
    );
  });

  app.get('/cards', (c) => {
    const q = c.req.query('q')?.trim();
    const set = c.req.query('set')?.trim();
    const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
    const pageSize = Math.min(1000, Math.max(1, parseInt(c.req.query('pageSize') ?? '500', 10) || 500));

    if (q) {
      return c.json({ cards: searchCards(db, q, set || undefined, pageSize), page, total: null });
    }

    const where = set ? 'WHERE set_code = ?' : '';
    const params = set ? [set.toUpperCase()] : [];
    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM cards ${where}`).get(...params) as { n: number }
    ).n;
    const cards = db
      .prepare(
        `SELECT id, set_code, collector_number, name, type, faction, rarity, image_url
         FROM cards ${where} ORDER BY set_code, collector_number
         LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, (page - 1) * pageSize);
    return c.json({ cards, page, total });
  });

  return app;
}
