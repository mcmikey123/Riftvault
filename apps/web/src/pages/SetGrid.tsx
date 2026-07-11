import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Card } from '@riftvault/types';
import { api } from '../api';
import { CardThumb } from '../components/CardThumb';

interface Qty {
  qty: number;
  qty_foil: number;
}

/**
 * The set checklist grid — primary correction surface for every entry mode.
 * Optimistic UI: steppers mutate local state instantly; deltas accumulate
 * and flush to /api/vault/adjust after 700ms of quiet. Long-press a cell to
 * switch its steppers to foil quantities.
 */
export function SetGrid() {
  const { code } = useParams();
  const [cards, setCards] = useState<Card[]>([]);
  const [quantities, setQuantities] = useState<Map<string, Qty>>(new Map());
  const [foilCells, setFoilCells] = useState<Set<string>>(new Set());
  const [err, setErr] = useState('');
  const pending = useRef(new Map<string, { delta: number; delta_foil: number }>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    if (!code) return;
    const [{ cards }, vault] = await Promise.all([
      api.cards({ set: code, pageSize: 1000 }),
      api.vault(),
    ]);
    setCards(cards);
    const map = new Map<string, Qty>();
    for (const row of vault) map.set(row.id, { qty: row.qty, qty_foil: row.qty_foil });
    setQuantities(map);
  }, [code]);

  useEffect(() => {
    reload().catch((e) => setErr((e as Error).message));
  }, [reload]);

  const flush = useCallback(async () => {
    const batch = [...pending.current.entries()]
      .map(([card_id, d]) => ({ card_id, ...d }))
      .filter((a) => a.delta !== 0 || a.delta_foil !== 0);
    pending.current.clear();
    if (batch.length === 0) return;
    try {
      await api.adjust(batch, 'grid');
    } catch (e) {
      setErr(`Save failed: ${(e as Error).message} — reloading`);
      reload().catch(() => undefined);
    }
  }, [reload]);

  // Flush pending writes when leaving the page.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      void flush();
    },
    [flush],
  );

  const adjust = (cardId: string, delta: number, deltaFoil: number) => {
    setQuantities((prev) => {
      const next = new Map(prev);
      const cur = next.get(cardId) ?? { qty: 0, qty_foil: 0 };
      const updated = {
        qty: Math.max(0, cur.qty + delta),
        qty_foil: Math.max(0, cur.qty_foil + deltaFoil),
      };
      const applied = { delta: updated.qty - cur.qty, delta_foil: updated.qty_foil - cur.qty_foil };
      next.set(cardId, updated);
      const p = pending.current.get(cardId) ?? { delta: 0, delta_foil: 0 };
      pending.current.set(cardId, {
        delta: p.delta + applied.delta,
        delta_foil: p.delta_foil + applied.delta_foil,
      });
      return next;
    });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
  };

  // Long-press toggles foil editing for a cell.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPress = (cardId: string) => {
    pressTimer.current = setTimeout(() => {
      setFoilCells((prev) => {
        const next = new Set(prev);
        if (next.has(cardId)) next.delete(cardId);
        else next.add(cardId);
        return next;
      });
      if (navigator.vibrate) navigator.vibrate(30);
    }, 450);
  };
  const endPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  return (
    <div className="stack">
      <h1>{code} checklist</h1>
      <p className="muted">Long-press a card to edit foils ✦</p>
      {err && <p className="error">{err}</p>}
      <div className="cardgrid">
        {cards.map((card) => {
          const q = quantities.get(card.id) ?? { qty: 0, qty_foil: 0 };
          const foil = foilCells.has(card.id);
          const owned = q.qty + q.qty_foil > 0;
          return (
            <div
              key={card.id}
              className={`cardcell ${owned ? 'owned' : ''} ${foil ? 'foilmode' : ''}`}
              onPointerDown={() => startPress(card.id)}
              onPointerUp={endPress}
              onPointerLeave={endPress}
              onContextMenu={(e) => e.preventDefault()}
            >
              <CardThumb card={card} />
              <div className="num">
                #{card.collector_number}
                {q.qty_foil > 0 && <span className="badge foil"> ✦{q.qty_foil}</span>}
              </div>
              <div className="name">{card.name}</div>
              <div className="stepper">
                <button
                  onClick={() => adjust(card.id, foil ? 0 : -1, foil ? -1 : 0)}
                  aria-label="minus"
                >
                  −
                </button>
                <span className={`qty ${foil ? 'foil' : ''} ${(foil ? q.qty_foil : q.qty) === 0 ? 'zero' : ''}`}>
                  {foil ? q.qty_foil : q.qty}
                </span>
                <button
                  onClick={() => adjust(card.id, foil ? 0 : 1, foil ? 1 : 0)}
                  aria-label="plus"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
