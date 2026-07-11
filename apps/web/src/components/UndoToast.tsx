import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * Post-commit toast with an undo button, backed by the batch_id from
 * vault_log. Auto-dismisses after 8s; undo reverses the whole batch.
 */
export function UndoToast({
  batchId,
  message,
  onDone,
}: {
  batchId: string;
  message: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState(message);

  useEffect(() => {
    const t = setTimeout(onDone, 8000);
    return () => clearTimeout(t);
  }, [onDone]);

  const undo = async () => {
    setBusy(true);
    try {
      await api.undo(batchId);
      setText('Undone');
      setTimeout(onDone, 1200);
    } catch (err) {
      setText(`Undo failed: ${(err as Error).message}`);
      setBusy(false);
    }
  };

  return (
    <div className="toast" role="status">
      <span>{text}</span>
      <button onClick={undo} disabled={busy}>
        Undo
      </button>
    </div>
  );
}
