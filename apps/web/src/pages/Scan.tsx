import { useEffect, useState } from 'react';
import type { ScanResponse } from '@riftvault/types';
import { api } from '../api';
import { ConfirmBatch } from '../components/ConfirmBatch';
import { UndoToast } from '../components/UndoToast';
import { prepareQuadrants, prepareSingle } from '../lib/image';

/**
 * Photo batch scan: camera/file → client resize (and optional quadrant
 * slicing for binder pages) → /api/scan → confirm screen → one batch.
 */
export function Scan() {
  const [busy, setBusy] = useState(false);
  const [binderMode, setBinderMode] = useState(false);
  const [fallbackModel, setFallbackModel] = useState(false);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [usage, setUsage] = useState<ScanResponse['usage'] | null>(null);
  const [toast, setToast] = useState<{ batchId: string; message: string } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.scanUsage().then(setUsage).catch(() => undefined);
  }, []);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setErr('');
    try {
      const images = binderMode ? await prepareQuadrants(file) : await prepareSingle(file);
      const res = await api.scan(images, fallbackModel ? 'fallback' : 'default');
      setResult(res);
      setUsage(res.usage);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="stack">
        <h1>Confirm scan</h1>
        {result.candidates.length === 0 && (
          <p className="muted">No cards recognised — try better light or fewer cards per shot.</p>
        )}
        <ConfirmBatch
          candidates={result.candidates}
          source="scan"
          onCommitted={(batchId, total) => {
            setResult(null);
            setToast({ batchId, message: `Added ${total} card(s) from scan` });
          }}
          onCancel={() => setResult(null)}
        />
      </div>
    );
  }

  return (
    <div className="stack">
      <h1>Scan cards</h1>
      <p className="muted">
        Lay up to 12 cards face-up, no overlap, decent light. Binder pages work through the
        plastic — glare hurts accuracy, the confirm screen catches it. Aim for 6–9 cards per
        shot; use binder mode for full pages.
      </p>
      <label className="row">
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          checked={binderMode}
          onChange={(e) => setBinderMode(e.target.checked)}
        />
        Binder page mode (slice photo into 4 crops)
      </label>
      <label className="row">
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          checked={fallbackModel}
          onChange={(e) => setFallbackModel(e.target.checked)}
        />
        Use fallback model (Sonnet — slower, sharper eyes)
      </label>
      <label className="tile" style={{ textAlign: 'center', opacity: busy ? 0.5 : 1 }}>
        <span className="ico">📷</span>
        {busy ? 'Scanning…' : 'Take / choose photo'}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          disabled={busy}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>
      {err && <p className="error">{err}</p>}
      {usage && (
        <p className="muted">
          Today: {usage.requests} scan(s), {usage.input_tokens + usage.output_tokens} tokens.
        </p>
      )}
      {toast && (
        <UndoToast batchId={toast.batchId} message={toast.message} onDone={() => setToast(null)} />
      )}
    </div>
  );
}
