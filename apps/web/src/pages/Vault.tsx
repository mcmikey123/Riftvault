import { useEffect, useMemo, useState } from 'react';
import type { SetSummary, VaultRow } from '@riftvault/types';
import { api } from '../api';
import { CardThumb } from '../components/CardThumb';

/** Filterable vault view: totals & completion per set, CSV export. */
export function Vault() {
  const [rows, setRows] = useState<VaultRow[]>([]);
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [filterSet, setFilterSet] = useState('');
  const [filterText, setFilterText] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([api.vault(), api.sets()])
      .then(([v, s]) => {
        setRows(v);
        setSets(s);
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  const filtered = useMemo(() => {
    const text = filterText.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (!filterSet || row.set_code === filterSet) &&
        (!text || row.name.toLowerCase().includes(text) || row.id.toLowerCase().includes(text)),
    );
  }, [rows, filterSet, filterText]);

  const totalCards = rows.reduce((n, r) => n + r.qty + r.qty_foil, 0);

  const exportCsv = async () => {
    try {
      const blob = await api.exportCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'riftbound-vault.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="stack">
      <div className="row spread">
        <h1 style={{ margin: 0 }}>Vault</h1>
        <button className="small" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      {err && <p className="error">{err}</p>}

      <div className="panel stack">
        <div>
          <strong>{totalCards}</strong> cards · <strong>{rows.length}</strong> unique
        </div>
        {sets.map((s) => (
          <div key={s.set_code} className="row spread muted">
            <span>{s.name ?? s.set_code}</span>
            <span>
              {s.owned_unique}/{s.card_count} unique ({Math.round(s.completion * 100)}%) ·{' '}
              {s.owned_total} total
            </span>
          </div>
        ))}
      </div>

      <div className="row">
        <select value={filterSet} onChange={(e) => setFilterSet(e.target.value)}>
          <option value="">All sets</option>
          {sets.map((s) => (
            <option key={s.set_code} value={s.set_code}>
              {s.name ?? s.set_code}
            </option>
          ))}
        </select>
        <input
          placeholder="Filter by name…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
      </div>

      {filtered.map((row) => (
        <div key={row.id} className="cardrow">
          <CardThumb card={row} />
          <div className="info">
            <div className="t">{row.name}</div>
            <div className="s">
              {row.id} · {row.rarity ?? '?'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <strong>×{row.qty}</strong>
            {row.qty_foil > 0 && <div className="badge foil">✦{row.qty_foil}</div>}
          </div>
        </div>
      ))}
      {filtered.length === 0 && <p className="muted">Nothing here yet.</p>}
    </div>
  );
}
