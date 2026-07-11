import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SetSummary } from '@riftvault/types';
import { api } from '../api';

export function Sets() {
  const [sets, setSets] = useState<SetSummary[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.sets().then(setSets).catch((e) => setErr((e as Error).message));
  }, []);

  return (
    <div className="stack">
      <h1>Sets</h1>
      {err && <p className="error">{err}</p>}
      {sets && sets.length === 0 && (
        <p className="muted">
          No cards in the local database yet — run <code>npm run sync-cards</code> on the server.
        </p>
      )}
      {sets?.map((s) => (
        <Link key={s.set_code} className="panel stack" to={`/sets/${s.set_code}`}>
          <div className="row spread">
            <strong>
              {s.name ?? s.set_code}
              {s.name && s.name !== s.set_code && (
                <span className="muted"> {s.set_code}</span>
              )}
            </strong>
            <span className="muted">
              {s.owned_unique}/{s.card_count} unique · {s.owned_total} total
            </span>
          </div>
          <div className="progress">
            <div style={{ width: `${Math.round(s.completion * 100)}%` }} />
          </div>
        </Link>
      ))}
    </div>
  );
}
