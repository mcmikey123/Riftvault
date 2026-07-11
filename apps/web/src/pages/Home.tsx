import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SetSummary } from '@riftvault/types';
import { api, getVaultKey, setVaultKey } from '../api';

const tiles = [
  { to: '/scan', ico: '📷', label: 'Scan cards', sub: 'photo → vault' },
  { to: '/rapid', ico: '⌨️', label: 'Rapid entry', sub: 'numbers, one set' },
  { to: '/sets', ico: '🗂️', label: 'Set checklists', sub: 'browse & tick off' },
  { to: '/search', ico: '🔍', label: 'Search', sub: 'loose singles' },
  { to: '/products', ico: '📦', label: 'Products', sub: 'precons, one tap' },
  { to: '/csv', ico: '📄', label: 'CSV import', sub: 'external exports' },
  { to: '/decks', ico: '🃏', label: 'Decks', sub: 'paste & diff' },
  { to: '/recs', ico: '✨', label: 'Buildable', sub: 'meta deck ranking' },
];

export function Home() {
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [err, setErr] = useState('');
  const [key, setKey] = useState(getVaultKey());

  useEffect(() => {
    api
      .sets()
      .then(setSets)
      .catch((e) => setErr((e as Error).message));
  }, []);

  const totalOwned = sets.reduce((n, s) => n + s.owned_total, 0);
  const totalUnique = sets.reduce((n, s) => n + s.owned_unique, 0);

  return (
    <div className="stack">
      <h1>Riftbound Vault</h1>
      <div className="panel row spread">
        <div>
          <strong>{totalOwned}</strong> cards · <strong>{totalUnique}</strong> unique
        </div>
        <Link to="/vault">vault →</Link>
      </div>
      {err && (
        <p className="error">
          {err === 'unauthorized'
            ? 'Unauthorized — set the vault key below.'
            : `API error: ${err}. Have you run npm run sync-cards?`}
        </p>
      )}
      <div className="tile-grid">
        {tiles.map((t) => (
          <Link className="tile" key={t.to} to={t.to}>
            <span className="ico">{t.ico}</span>
            {t.label}
            <div className="sub">{t.sub}</div>
          </Link>
        ))}
      </div>
      <details>
        <summary className="muted">Vault key (only needed when VAULT_KEY is set on the server)</summary>
        <div className="row" style={{ marginTop: 8 }}>
          <input
            type="password"
            value={key}
            placeholder="shared secret"
            onChange={(e) => setKey(e.target.value)}
          />
          <button
            onClick={() => {
              setVaultKey(key);
              location.reload();
            }}
          >
            Save
          </button>
        </div>
      </details>
    </div>
  );
}
