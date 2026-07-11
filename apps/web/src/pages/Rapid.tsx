import { useEffect, useState } from 'react';
import type { BulkResponse, SetSummary } from '@riftvault/types';
import { api } from '../api';
import { ConfirmBatch } from '../components/ConfirmBatch';
import { UndoToast } from '../components/UndoToast';

/**
 * Rapid number entry: pick a set, type "45x3 67 112 203x2", confirm.
 * Fastest bulk path for sorted singles — no names, ever.
 */
export function Rapid() {
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [set, setSet] = useState('');
  const [input, setInput] = useState('');
  const [result, setResult] = useState<BulkResponse | null>(null);
  const [toast, setToast] = useState<{ batchId: string; message: string } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api
      .sets()
      .then((s) => {
        setSets(s);
        if (s.length > 0 && !set) setSet(s[0]!.set_code);
      })
      .catch((e) => setErr((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolve = async () => {
    setErr('');
    try {
      setResult(await api.bulk(set, input));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (result) {
    return (
      <div className="stack">
        <h1>Confirm — {set}</h1>
        {result.unknown.length > 0 && (
          <div className="panel">
            <strong className="error">Not matched:</strong>{' '}
            {result.unknown.map((u) => `${u.raw} (${u.reason})`).join(', ')}
          </div>
        )}
        <ConfirmBatch
          candidates={result.candidates}
          source="bulk"
          onCommitted={(batchId, total) => {
            setResult(null);
            setInput('');
            setToast({ batchId, message: `Added ${total} card(s)` });
          }}
          onCancel={() => setResult(null)}
        />
      </div>
    );
  }

  return (
    <div className="stack">
      <h1>Rapid number entry</h1>
      <select value={set} onChange={(e) => setSet(e.target.value)}>
        {sets.map((s) => (
          <option key={s.set_code} value={s.set_code}>
            {s.set_code} ({s.card_count} cards)
          </option>
        ))}
      </select>
      <textarea
        placeholder={'45x3 67 112 203x2\nAlso works: 45*3, commas, newlines'}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        inputMode="text"
        autoCapitalize="off"
        autoCorrect="off"
      />
      {err && <p className="error">{err}</p>}
      <button className="primary" disabled={!set || !input.trim()} onClick={resolve}>
        Resolve
      </button>
      {toast && (
        <UndoToast batchId={toast.batchId} message={toast.message} onDone={() => setToast(null)} />
      )}
    </div>
  );
}
