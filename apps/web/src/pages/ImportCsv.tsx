import { useState } from 'react';
import type { BulkResponse } from '@riftvault/types';
import { api } from '../api';
import { ConfirmBatch } from '../components/ConfirmBatch';
import { UndoToast } from '../components/UndoToast';

/** CSV import (`set,number,qty[,qty_foil]`) → same confirm flow as everything else. */
export function ImportCsv() {
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<BulkResponse | null>(null);
  const [toast, setToast] = useState<{ batchId: string; message: string } | null>(null);
  const [err, setErr] = useState('');

  const onFile = (file: File | undefined) => {
    if (!file) return;
    file.text().then(setCsv);
  };

  const resolve = async () => {
    setErr('');
    try {
      setResult(await api.importCsv(csv));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (result) {
    return (
      <div className="stack">
        <h1>Confirm CSV import</h1>
        {result.unknown.length > 0 && (
          <div className="panel">
            <strong className="error">Skipped rows:</strong>
            <pre className="mono">
              {result.unknown.map((u) => `${u.raw} — ${u.reason}`).join('\n')}
            </pre>
          </div>
        )}
        <ConfirmBatch
          candidates={result.candidates}
          source="csv"
          onCommitted={(batchId, total) => {
            setResult(null);
            setCsv('');
            setToast({ batchId, message: `Imported ${total} card(s)` });
          }}
          onCancel={() => setResult(null)}
        />
      </div>
    );
  }

  return (
    <div className="stack">
      <h1>CSV import</h1>
      <p className="muted">
        Format: <code>set,number,qty[,qty_foil]</code> — header row optional.
      </p>
      <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
      <textarea
        placeholder={'set,number,qty,qty_foil\nOGN,45,3\nOGN,67,1,2'}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
      />
      {err && <p className="error">{err}</p>}
      <button className="primary" disabled={!csv.trim()} onClick={resolve}>
        Resolve
      </button>
      {toast && (
        <UndoToast batchId={toast.batchId} message={toast.message} onDone={() => setToast(null)} />
      )}
    </div>
  );
}
