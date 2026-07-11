import { Hono } from 'hono';
import type { Adjustment, EntrySource } from '@riftvault/types';
import type { Db } from '../db.js';
import type { User } from '../lib/users.js';
import { UnknownCardError, applyAdjustments, undoBatch } from '../lib/vaultStore.js';

const SOURCES = new Set(['grid', 'search', 'scan', 'voice', 'product', 'bulk', 'csv']);

type AppEnv = { Variables: { user: User } };

export function vaultRoutes(db: Db) {
  const app = new Hono<AppEnv>();

  app.get('/vault', (c) => {
    const rows = db
      .prepare(
        `SELECT c.id, c.set_code, c.collector_number, c.name, c.type, c.faction, c.rarity,
                c.image_url, v.qty, v.qty_foil, v.updated_at
         FROM vault v JOIN cards c ON c.id = v.card_id
         WHERE v.user_id = ? AND (v.qty > 0 OR v.qty_foil > 0)
         ORDER BY c.set_code, c.collector_number`,
      )
      .all(c.get('user').id);
    return c.json(rows);
  });

  app.post('/vault/adjust', async (c) => {
    const body = (await c.req.json()) as {
      adjustments?: Adjustment[];
      source?: string;
      batch_id?: string;
    };
    const adjustments = Array.isArray(body.adjustments) ? body.adjustments : [];
    if (adjustments.length === 0) return c.json({ error: 'no adjustments' }, 400);
    for (const a of adjustments) {
      if (typeof a.card_id !== 'string' || !Number.isInteger(a.delta ?? 0) ||
          !Number.isInteger(a.delta_foil ?? 0)) {
        return c.json({ error: 'bad adjustment row' }, 400);
      }
    }
    const source = (body.source && SOURCES.has(body.source) ? body.source : 'grid') as EntrySource;
    try {
      return c.json(applyAdjustments(db, c.get('user').id, adjustments, source, body.batch_id));
    } catch (err) {
      if (err instanceof UnknownCardError) {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }
  });

  app.post('/vault/undo', (c) => {
    const batchId = c.req.query('batch_id');
    if (!batchId) return c.json({ error: 'batch_id required' }, 400);
    const result = undoBatch(db, c.get('user').id, batchId);
    if (!result) return c.json({ error: 'batch not found or already undone' }, 404);
    return c.json(result);
  });

  app.get('/export', (c) => {
    const rows = db
      .prepare(
        `SELECT c.set_code, c.collector_number, c.name, v.qty, v.qty_foil
         FROM vault v JOIN cards c ON c.id = v.card_id
         WHERE v.user_id = ? AND (v.qty > 0 OR v.qty_foil > 0)
         ORDER BY c.set_code, c.collector_number`,
      )
      .all(c.get('user').id) as {
      set_code: string;
      collector_number: number;
      name: string;
      qty: number;
      qty_foil: number;
    }[];
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const csv = [
      'set,number,name,qty,qty_foil',
      ...rows.map((r) => `${r.set_code},${r.collector_number},${esc(r.name)},${r.qty},${r.qty_foil}`),
    ].join('\n');
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', 'attachment; filename="riftbound-vault.csv"');
    return c.body(csv);
  });

  return app;
}
