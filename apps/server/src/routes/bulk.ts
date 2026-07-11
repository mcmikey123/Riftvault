import { Hono } from 'hono';
import type { BulkResponse, Candidate } from '@riftvault/types';
import type { Db } from '../db.js';
import { parseVaultCsv } from '../lib/parseCsv.js';
import { parseRapidEntry } from '../lib/parseRapidEntry.js';
import { getCardByRef } from '../lib/search.js';

/**
 * Set-scoped rapid number entry and CSV import. Both resolve to the same
 * confirm-screen candidate shape and never write to the vault directly.
 */
export function bulkRoutes(db: Db) {
  const app = new Hono();

  app.post('/vault/bulk', async (c) => {
    const body = (await c.req.json()) as { set_code?: string; input?: string };
    const set = body.set_code?.trim().toUpperCase();
    if (!set) return c.json({ error: 'set_code required' }, 400);
    if (!body.input?.trim()) return c.json({ error: 'input required' }, 400);

    const { entries, invalid } = parseRapidEntry(body.input);
    const candidates: Candidate[] = [];
    const unknown: BulkResponse['unknown'] = invalid.map((raw) => ({
      raw,
      reason: 'not a number',
    }));

    for (const entry of entries) {
      const card = getCardByRef(db, set, entry.collector_number);
      if (card) {
        candidates.push({ card, count: entry.count, confidence: 'high', raw: String(entry.collector_number) });
      } else {
        unknown.push({ raw: String(entry.collector_number), reason: `no card ${set}-${entry.collector_number}` });
      }
    }
    return c.json({ candidates, unknown } satisfies BulkResponse);
  });

  app.post('/import/csv', async (c) => {
    const body = (await c.req.json()) as { csv?: string };
    if (!body.csv?.trim()) return c.json({ error: 'csv required' }, 400);

    const { rows, invalid } = parseVaultCsv(body.csv);
    const candidates: Candidate[] = [];
    const unknown: BulkResponse['unknown'] = invalid.map((r) => ({
      raw: r.line,
      reason: r.reason,
    }));

    for (const row of rows) {
      const card = getCardByRef(db, row.set_code, row.collector_number);
      if (card) {
        candidates.push({
          card,
          count: row.qty,
          count_foil: row.qty_foil || undefined,
          confidence: 'high',
          raw: `${row.set_code},${row.collector_number}`,
        });
      } else {
        unknown.push({
          raw: `${row.set_code},${row.collector_number}`,
          reason: 'card not in local DB — run sync-cards?',
        });
      }
    }
    return c.json({ candidates, unknown } satisfies BulkResponse);
  });

  return app;
}
