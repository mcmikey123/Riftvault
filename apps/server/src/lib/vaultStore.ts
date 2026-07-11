import { randomUUID } from 'node:crypto';
import type { Adjustment, AdjustResult, EntrySource } from '@riftvault/types';
import type { Db } from '../db.js';

/**
 * All vault writes go through here: quantities are clamped at zero, the
 * *applied* delta (post-clamp) is what lands in vault_log, and every call is
 * one transaction under one batch_id so it can be undone atomically.
 * Everything is scoped to one user.
 */
export function applyAdjustments(
  db: Db,
  userId: number,
  adjustments: Adjustment[],
  source: EntrySource,
  batchId?: string,
): AdjustResult {
  const batch_id = batchId ?? randomUUID();
  const now = new Date().toISOString();

  const getRow = db.prepare(
    'SELECT qty, qty_foil FROM vault WHERE user_id = ? AND card_id = ?',
  );
  const cardExists = db.prepare('SELECT 1 FROM cards WHERE id = ?');
  const upsert = db.prepare(
    `INSERT INTO vault (user_id, card_id, qty, qty_foil, updated_at)
     VALUES (@user_id, @card_id, @qty, @qty_foil, @now)
     ON CONFLICT(user_id, card_id) DO UPDATE SET qty = @qty, qty_foil = @qty_foil, updated_at = @now`,
  );
  const log = db.prepare(
    `INSERT INTO vault_log (user_id, card_id, delta, delta_foil, source, batch_id, created_at)
     VALUES (@user_id, @card_id, @delta, @delta_foil, @source, @batch_id, @now)`,
  );

  const rows: AdjustResult['rows'] = [];
  const run = db.transaction(() => {
    for (const adj of adjustments) {
      if (!cardExists.get(adj.card_id)) {
        throw new UnknownCardError(adj.card_id);
      }
      const current = (getRow.get(userId, adj.card_id) as
        | { qty: number; qty_foil: number }
        | undefined) ?? { qty: 0, qty_foil: 0 };
      const qty = Math.max(0, current.qty + (adj.delta || 0));
      const qty_foil = Math.max(0, current.qty_foil + (adj.delta_foil || 0));
      const applied = qty - current.qty;
      const appliedFoil = qty_foil - current.qty_foil;
      if (applied !== 0 || appliedFoil !== 0) {
        upsert.run({ user_id: userId, card_id: adj.card_id, qty, qty_foil, now });
        log.run({
          user_id: userId,
          card_id: adj.card_id,
          delta: applied,
          delta_foil: appliedFoil,
          source,
          batch_id,
          now,
        });
      }
      rows.push({ card_id: adj.card_id, qty, qty_foil });
    }
  });
  run();

  return { batch_id, rows };
}

export class UnknownCardError extends Error {
  constructor(public card_id: string) {
    super(`unknown card_id: ${card_id}`);
  }
}

/**
 * Reverse every log row of a user's batch. The undo itself is logged under
 * batch `undo:<original>` which doubles as the already-undone marker.
 */
export function undoBatch(db: Db, userId: number, batchId: string): AdjustResult | null {
  const undoMarker = `undo:${batchId}`;
  const already = db
    .prepare('SELECT 1 FROM vault_log WHERE user_id = ? AND batch_id = ? LIMIT 1')
    .get(userId, undoMarker);
  if (already) return null;

  const rows = db
    .prepare(
      `SELECT card_id, SUM(delta) AS delta, SUM(delta_foil) AS delta_foil
       FROM vault_log WHERE user_id = ? AND batch_id = ? GROUP BY card_id`,
    )
    .all(userId, batchId) as { card_id: string; delta: number; delta_foil: number }[];
  if (rows.length === 0) return null;

  return applyAdjustments(
    db,
    userId,
    rows.map((r) => ({ card_id: r.card_id, delta: -r.delta, delta_foil: -r.delta_foil })),
    'undo',
    undoMarker,
  );
}
