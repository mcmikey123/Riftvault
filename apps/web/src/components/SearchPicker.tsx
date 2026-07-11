import { useEffect, useRef, useState } from 'react';
import type { Card } from '@riftvault/types';
import { api } from '../api';
import { CardThumb } from './CardThumb';

/** Bottom-sheet fuzzy search for manually resolving a card. */
export function SearchPicker({
  title,
  initialQuery = '',
  onPick,
  onClose,
}: {
  title: string;
  initialQuery?: string;
  onPick: (card: Card) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<Card[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const { cards } = await api.cards({ q, pageSize: 20 });
        setResults(cards);
      } catch {
        setResults([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row spread">
          <h1 style={{ margin: 0, fontSize: '1.05rem' }}>{title}</h1>
          <button className="small" onClick={onClose}>
            Close
          </button>
        </div>
        <input
          ref={inputRef}
          placeholder="Search card name or ID (min 2 chars)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ margin: '10px 0' }}
        />
        <div className="stack">
          {results.map((card) => (
            <div key={card.id} className="cardrow" onClick={() => onPick(card)}>
              <CardThumb card={card} />
              <div className="info">
                <div className="t">{card.name}</div>
                <div className="s">
                  {card.id} · {card.rarity ?? '?'} · {card.faction ?? '?'}
                </div>
              </div>
            </div>
          ))}
          {q.trim().length >= 2 && results.length === 0 && (
            <p className="muted">No matches.</p>
          )}
        </div>
      </div>
    </div>
  );
}
