import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RecommendationsResponse } from '@riftvault/types';
import { api } from '../api';

/** "What can I build?" — meta decks ranked by buildability + most-wanted pickups. */
export function Recommendations() {
  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.recommendations().then(setData).catch((e) => setErr((e as Error).message));
  }, []);

  if (err) return <p className="error">{err}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const ready = data.decks.filter((d) => d.ready);
  const rest = data.decks.filter((d) => !d.ready);

  return (
    <div className="stack">
      <h1>Buildable decks</h1>
      {data.decks.length === 0 && (
        <p className="muted">
          No meta decks yet — import some on the <Link to="/decks">Decks</Link> screen with kind
          “Meta deck”.
        </p>
      )}

      {ready.length > 0 && <h2>Ready to build 🎉</h2>}
      {ready.map((score) => (
        <Link key={score.deck.id} to={`/decks/${score.deck.id}`} className="panel row spread">
          <strong>
            {score.deck.meta_tier != null && (
              <span className="badge accent" style={{ marginRight: 6 }}>
                T{score.deck.meta_tier}
              </span>
            )}
            {score.deck.name}
          </strong>
          <span className="badge green">100%</span>
        </Link>
      ))}

      {rest.length > 0 && <h2>Closest to complete</h2>}
      {rest.map((score) => (
        <Link key={score.deck.id} to={`/decks/${score.deck.id}`} className="panel stack">
          <div className="row spread">
            <strong>
              {score.deck.meta_tier != null && (
                <span className="badge accent" style={{ marginRight: 6 }}>
                  T{score.deck.meta_tier}
                </span>
              )}
              {score.deck.name}
            </strong>
            <span>
              {score.nearly_there && <span className="badge amber">nearly there</span>}{' '}
              {Math.round(score.completion * 100)}%
            </span>
          </div>
          <div className="progress">
            <div style={{ width: `${Math.round(score.completion * 100)}%` }} />
          </div>
          <div className="muted">
            {score.missing_count} copies short ({score.missing_unique} distinct) · cost ~
            {score.cost_proxy}
          </div>
          <div className="row wrap">
            {score.missing.slice(0, 6).map((r) => (
              <span key={r.card.id} className="badge">
                {r.need - Math.min(r.have, r.need)}× {r.card.name}
              </span>
            ))}
            {score.missing.length > 6 && (
              <span className="badge">+{score.missing.length - 6} more</span>
            )}
          </div>
        </Link>
      ))}

      {data.most_wanted.length > 0 && (
        <>
          <h2>Most wanted pickups</h2>
          <p className="muted">Cards blocking the most near-complete decks — buy these first.</p>
          {data.most_wanted.slice(0, 15).map((row) => (
            <div key={row.card.id} className="panel row spread">
              <div>
                <strong>{row.card.name}</strong>
                <div className="muted">
                  {row.card.id} · {row.card.rarity ?? '?'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div>
                  {row.copies_needed_total} cop{row.copies_needed_total === 1 ? 'y' : 'ies'}
                </div>
                <div className="muted">unlocks {row.decks_count} deck(s)</div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
