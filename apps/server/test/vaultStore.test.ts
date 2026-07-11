import { describe, expect, it } from 'vitest';
import { applyAdjustments, undoBatch, UnknownCardError } from '../src/lib/vaultStore.js';
import { seedDb } from './fixtures.js';

describe('applyAdjustments', () => {
  it('applies a batch and logs it', () => {
    const db = seedDb();
    const result = applyAdjustments(
      db,
      [
        { card_id: 'OGN-045', delta: 3 },
        { card_id: 'OGN-067', delta: 1, delta_foil: 2 },
      ],
      'grid',
    );
    expect(result.rows).toEqual([
      { card_id: 'OGN-045', qty: 3, qty_foil: 0 },
      { card_id: 'OGN-067', qty: 1, qty_foil: 2 },
    ]);
    const logs = db.prepare('SELECT * FROM vault_log WHERE batch_id = ?').all(result.batch_id);
    expect(logs).toHaveLength(2);
  });

  it('clamps at zero and logs the applied delta, not the requested one', () => {
    const db = seedDb();
    applyAdjustments(db, [{ card_id: 'OGN-045', delta: 2 }], 'grid');
    const result = applyAdjustments(db, [{ card_id: 'OGN-045', delta: -5 }], 'grid');
    expect(result.rows[0]).toEqual({ card_id: 'OGN-045', qty: 0, qty_foil: 0 });
    const log = db
      .prepare('SELECT delta FROM vault_log WHERE batch_id = ?')
      .get(result.batch_id) as { delta: number };
    expect(log.delta).toBe(-2);
  });

  it('rejects unknown cards atomically (nothing partial is written)', () => {
    const db = seedDb();
    expect(() =>
      applyAdjustments(
        db,
        [
          { card_id: 'OGN-045', delta: 1 },
          { card_id: 'ZZZ-999', delta: 1 },
        ],
        'grid',
      ),
    ).toThrow(UnknownCardError);
    const rows = db.prepare('SELECT COUNT(*) AS n FROM vault').get() as { n: number };
    expect(rows.n).toBe(0);
  });

  it('skips no-op log rows but still reports quantities', () => {
    const db = seedDb();
    const result = applyAdjustments(db, [{ card_id: 'OGN-045', delta: 0 }], 'grid');
    expect(result.rows[0]).toEqual({ card_id: 'OGN-045', qty: 0, qty_foil: 0 });
    const logs = db.prepare('SELECT COUNT(*) AS n FROM vault_log').get() as { n: number };
    expect(logs.n).toBe(0);
  });
});

describe('undoBatch', () => {
  it('reverses a whole batch', () => {
    const db = seedDb();
    const batch = applyAdjustments(
      db,
      [
        { card_id: 'OGN-045', delta: 3 },
        { card_id: 'OGN-067', delta: 1, delta_foil: 2 },
      ],
      'scan',
    );
    const undone = undoBatch(db, batch.batch_id);
    expect(undone).not.toBeNull();
    expect(undone!.rows).toEqual([
      { card_id: 'OGN-045', qty: 0, qty_foil: 0 },
      { card_id: 'OGN-067', qty: 0, qty_foil: 0 },
    ]);
  });

  it('refuses to undo twice', () => {
    const db = seedDb();
    const batch = applyAdjustments(db, [{ card_id: 'OGN-045', delta: 3 }], 'scan');
    expect(undoBatch(db, batch.batch_id)).not.toBeNull();
    expect(undoBatch(db, batch.batch_id)).toBeNull();
  });

  it('returns null for unknown batches', () => {
    const db = seedDb();
    expect(undoBatch(db, 'nope')).toBeNull();
  });
});
