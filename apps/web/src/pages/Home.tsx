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
  const [me, setMe] = useState<{ name: string } | null>(null);
  const [needKey, setNeedKey] = useState(false);
  const [err, setErr] = useState('');
  const [key, setKey] = useState(getVaultKey());

  useEffect(() => {
    api
      .me()
      .then((user) => {
        setMe(user);
        setNeedKey(false);
        return api.sets().then(setSets);
      })
      .catch((e) => {
        const msg = (e as Error).message;
        if (msg.startsWith('unauthorized')) setNeedKey(true);
        else setErr(`API error: ${msg}. Have you run npm run sync-cards?`);
      });
  }, []);

  const totalOwned = sets.reduce((n, s) => n + s.owned_total, 0);
  const totalUnique = sets.reduce((n, s) => n + s.owned_unique, 0);

  const keyForm = (
    <div className="row" style={{ marginTop: 8 }}>
      <input
        type="password"
        value={key}
        placeholder="access key"
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            setVaultKey(key.trim());
            location.reload();
          }
        }}
      />
      <button
        className="primary"
        onClick={() => {
          setVaultKey(key.trim());
          location.reload();
        }}
      >
        Save
      </button>
    </div>
  );

  if (needKey) {
    return (
      <div className="stack">
        <h1>Riftbound Vault</h1>
        <div className="panel stack">
          <strong>Enter your access key</strong>
          <p className="muted">
            Each person has their own key (and their own vault). Ask whoever runs the server —
            keys are created with <code>npm run add-user -- --name you</code>.
          </p>
          {keyForm}
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="row spread">
        <h1 style={{ margin: 0 }}>Riftbound Vault</h1>
        {me && <span className="badge accent">👤 {me.name}</span>}
      </div>
      <div className="panel row spread">
        <div>
          <strong>{totalOwned}</strong> cards · <strong>{totalUnique}</strong> unique
        </div>
        <Link to="/vault">vault →</Link>
      </div>
      {err && <p className="error">{err}</p>}
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
        <summary className="muted">Switch access key</summary>
        {keyForm}
      </details>
    </div>
  );
}
