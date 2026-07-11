import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { DeckDiff } from '@riftvault/types';
import { api, type DeckJson } from '../api';
import { CardThumb } from '../components/CardThumb';
import { SearchPicker } from '../components/SearchPicker';

/**
 * The payoff screen: deck vs vault. Green = have enough, amber = partial,
 * red = none; copyable buylist of what's missing; unresolved lines fixable
 * via the search picker.
 */
export function DeckDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deck, setDeck] = useState<DeckJson | null>(null);
  const [diff, setDiff] = useState<DeckDiff | null>(null);
  const [fixLine, setFixLine] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  const reload = useCallback(async () => {
    if (!id) return;
    const [d, df] = await Promise.all([api.deck(id), api.diff(id)]);
    setDeck(d);
    setDiff(df);
  }, [id]);

  useEffect(() => {
    reload().catch((e) => setErr((e as Error).message));
  }, [reload]);

  if (!deck || !diff) return <p className="muted">{err || 'Loading…'}</p>;

  const partial = diff.missing.filter((r) => r.have > 0);
  const none = diff.missing.filter((r) => r.have === 0);

  const buylist = diff.missing
    .map((r) => `${r.need - Math.min(r.have, r.need)} ${r.card.name}`)
    .join('\n');

  const copyBuylist = async () => {
    await navigator.clipboard.writeText(buylist);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const remove = async () => {
    if (!confirm(`Delete deck "${deck.name}"?`)) return;
    await api.deleteDeck(deck.id);
    navigate('/decks');
  };

  return (
    <div className="stack">
      <div className="row spread">
        <h1 style={{ margin: 0 }}>{deck.name}</h1>
        <button className="small danger" onClick={remove}>
          delete
        </button>
      </div>
      <div className="panel row spread">
        <span>
          {Math.round(diff.completion * 100)}% ·{' '}
          {diff.total_missing === 0 ? (
            <span className="badge green">ready to build</span>
          ) : (
            <span className="badge amber">{diff.total_missing} cards missing</span>
          )}
        </span>
        <span className="muted">{deck.kind}</span>
      </div>
      <div className="progress">
        <div style={{ width: `${Math.round(diff.completion * 100)}%` }} />
      </div>
      {deck.source_url && (
        <a href={deck.source_url} target="_blank" rel="noreferrer" className="muted">
          source ↗
        </a>
      )}

      {deck.unresolved.length > 0 && (
        <div className="panel stack">
          <strong className="error">Unresolved lines — tap to fix:</strong>
          {deck.unresolved.map((line) => (
            <button key={line} onClick={() => setFixLine(line)} style={{ textAlign: 'left' }}>
              {line}
            </button>
          ))}
        </div>
      )}

      {diff.total_missing > 0 && (
        <button onClick={copyBuylist}>{copied ? 'Copied ✓' : 'Copy missing buylist'}</button>
      )}

      {none.length > 0 && <h2>Missing entirely ({none.length})</h2>}
      {none.map((r) => (
        <div key={r.card.id} className="cardrow none">
          <CardThumb card={r.card} />
          <div className="info">
            <div className="t">{r.card.name}</div>
            <div className="s">{r.card.id} · {r.card.rarity ?? '?'}</div>
          </div>
          <span className="badge red">0/{r.need}</span>
        </div>
      ))}

      {partial.length > 0 && <h2>Partial ({partial.length})</h2>}
      {partial.map((r) => (
        <div key={r.card.id} className="cardrow partial">
          <CardThumb card={r.card} />
          <div className="info">
            <div className="t">{r.card.name}</div>
            <div className="s">{r.card.id}</div>
          </div>
          <span className="badge amber">
            {r.have}/{r.need}
          </span>
        </div>
      ))}

      <h2>Have ({diff.have.length})</h2>
      {diff.have.map((r) => (
        <div key={r.card.id} className="cardrow have">
          <CardThumb card={r.card} />
          <div className="info">
            <div className="t">{r.card.name}</div>
            <div className="s">{r.card.id}</div>
          </div>
          <span className="badge green">
            {Math.min(r.have, r.need)}/{r.need}
          </span>
        </div>
      ))}

      {fixLine && (
        <SearchPicker
          title={`Fix: ${fixLine}`}
          initialQuery={fixLine.replace(/^\d+\s*[xX]?\s*/, '').replace(/\s+[xX]\s*\d+$/, '')}
          onPick={async (card) => {
            const qtyMatch = fixLine.match(/^(\d+)/) ?? fixLine.match(/[xX]\s*(\d+)$/);
            const qty = qtyMatch ? parseInt(qtyMatch[1]!, 10) : 1;
            await api.setDeckCard(deck.id, card.id, qty, fixLine);
            setFixLine(null);
            await reload();
          }}
          onClose={() => setFixLine(null)}
        />
      )}
    </div>
  );
}
