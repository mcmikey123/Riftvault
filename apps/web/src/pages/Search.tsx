import { useEffect, useState } from 'react';
import type { Card } from '@riftvault/types';
import { api } from '../api';
import { CardThumb } from '../components/CardThumb';
import { Stepper } from '../components/Stepper';
import { UndoToast } from '../components/UndoToast';

/** Fuzzy search entry for loose singles: type → tap → stepper. */
export function Search() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Card[]>([]);
  const [quantities, setQuantities] = useState<Map<string, { qty: number; qty_foil: number }>>(
    new Map(),
  );
  const [toast, setToast] = useState<{ batchId: string; message: string } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const [{ cards }, vault] = await Promise.all([api.cards({ q, pageSize: 20 }), api.vault()]);
        setResults(cards);
        const map = new Map<string, { qty: number; qty_foil: number }>();
        for (const row of vault) map.set(row.id, { qty: row.qty, qty_foil: row.qty_foil });
        setQuantities(map);
        setErr('');
      } catch (e) {
        setErr((e as Error).message);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const adjust = async (card: Card, delta: number, deltaFoil: number) => {
    setQuantities((prev) => {
      const next = new Map(prev);
      const cur = next.get(card.id) ?? { qty: 0, qty_foil: 0 };
      next.set(card.id, {
        qty: Math.max(0, cur.qty + delta),
        qty_foil: Math.max(0, cur.qty_foil + deltaFoil),
      });
      return next;
    });
    try {
      const result = await api.adjust([{ card_id: card.id, delta, delta_foil: deltaFoil }], 'search');
      if (delta > 0 || deltaFoil > 0) {
        setToast({ batchId: result.batch_id, message: `Added ${card.name}` });
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="stack">
      <h1>Search</h1>
      <input
        autoFocus
        placeholder="Card name or ID (e.g. void gate, OGN-45)…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {err && <p className="error">{err}</p>}
      {results.map((card) => {
        const q2 = quantities.get(card.id) ?? { qty: 0, qty_foil: 0 };
        return (
          <div key={card.id} className="cardrow">
            <CardThumb card={card} />
            <div className="info">
              <div className="t">{card.name}</div>
              <div className="s">
                {card.id} · {card.rarity ?? '?'}
                {q2.qty_foil > 0 && <span className="badge foil"> ✦{q2.qty_foil}</span>}
              </div>
              <button
                className="small"
                style={{ marginTop: 4 }}
                onClick={() => adjust(card, 0, 1)}
              >
                + foil
              </button>
            </div>
            <div style={{ width: 110 }}>
              <Stepper value={q2.qty} onChange={(v) => adjust(card, v - q2.qty, 0)} />
            </div>
          </div>
        );
      })}
      {toast && (
        <UndoToast batchId={toast.batchId} message={toast.message} onDone={() => setToast(null)} />
      )}
    </div>
  );
}
