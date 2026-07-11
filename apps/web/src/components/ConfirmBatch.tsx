import { useState } from 'react';
import type { Candidate, Card, EntrySource } from '@riftvault/types';
import { api } from '../api';
import { CardThumb } from './CardThumb';
import { SearchPicker } from './SearchPicker';
import { Stepper } from './Stepper';

/**
 * The shared confirm screen: every bulk entry mode (rapid numbers, CSV,
 * scan, voice-later) resolves to candidates and commits through here as one
 * undoable batch. Nothing touches the vault until "Add all".
 */
export function ConfirmBatch({
  candidates: initial,
  source,
  onCommitted,
  onCancel,
}: {
  candidates: Candidate[];
  source: EntrySource;
  onCommitted: (batchId: string, total: number) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<Candidate[]>(initial);
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const update = (i: number, patch: Partial<Candidate>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));

  const ready = rows.filter((r) => r.card && (r.count > 0 || (r.count_foil ?? 0) > 0));
  const unresolvedCount = rows.filter((r) => !r.card).length;

  const commit = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api.adjust(
        ready.map((r) => ({
          card_id: r.card!.id,
          delta: r.count,
          delta_foil: r.count_foil ?? 0,
        })),
        source,
      );
      const total = ready.reduce((n, r) => n + r.count + (r.count_foil ?? 0), 0);
      onCommitted(result.batch_id, total);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      {rows.map((row, i) => (
        <div
          key={i}
          className={`cardrow ${row.card ? (row.flag ? 'flagged' : '') : 'err'}`}
        >
          {row.card ? <CardThumb card={row.card} /> : <div className="thumb placeholder">?</div>}
          <div className="info">
            <div className="t">{row.card ? row.card.name : (row.raw ?? 'Unknown')}</div>
            <div className="s">
              {row.card ? `${row.card.id} · ${row.card.rarity ?? '?'}` : 'not matched'}
              {row.flag ? ` — ${row.flag}` : ''}
            </div>
            {row.alternatives && row.alternatives.length > 0 && (
              <div className="row wrap" style={{ marginTop: 4 }}>
                {row.alternatives.map((alt: Card) => (
                  <button
                    key={alt.id}
                    className="small"
                    onClick={() =>
                      update(i, {
                        card: alt,
                        flag: undefined,
                        confidence: 'high',
                        alternatives: row.alternatives!.filter((a) => a.id !== alt.id).concat(
                          row.card ? [row.card] : [],
                        ),
                      })
                    }
                  >
                    {alt.id}
                  </button>
                ))}
                {!row.card && (
                  <button className="small" onClick={() => setPickerFor(i)}>
                    search…
                  </button>
                )}
              </div>
            )}
            {!row.card && (!row.alternatives || row.alternatives.length === 0) && (
              <button className="small" style={{ marginTop: 4 }} onClick={() => setPickerFor(i)}>
                Pick card…
              </button>
            )}
          </div>
          <div className="stack" style={{ width: 110 }}>
            <Stepper value={row.count} onChange={(v) => update(i, { count: v })} />
            {(row.count_foil ?? 0) > 0 ? (
              <Stepper
                foil
                value={row.count_foil ?? 0}
                onChange={(v) => update(i, { count_foil: v })}
              />
            ) : (
              <button className="small" onClick={() => update(i, { count_foil: 1 })}>
                + foil
              </button>
            )}
            <button className="small danger" onClick={() => remove(i)}>
              remove
            </button>
          </div>
        </div>
      ))}

      {rows.length === 0 && <p className="muted">Nothing to add.</p>}
      {error && <p className="error">{error}</p>}

      <div className="row">
        <button className="primary" disabled={busy || ready.length === 0} onClick={commit}>
          Add {ready.reduce((n, r) => n + r.count + (r.count_foil ?? 0), 0)} card(s) to vault
        </button>
        <button onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
      {unresolvedCount > 0 && (
        <p className="muted">{unresolvedCount} unresolved row(s) will be skipped.</p>
      )}

      {pickerFor !== null && (
        <SearchPicker
          title="Pick the right card"
          initialQuery={rows[pickerFor]?.raw?.replace(/[^a-zA-Z\s]/g, ' ').trim() ?? ''}
          onPick={(card) => {
            update(pickerFor, { card, flag: undefined, confidence: 'high' });
            setPickerFor(null);
          }}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  );
}
