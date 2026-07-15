import { useEffect, useMemo, useState } from 'react';
import { rowValue, type SetSummary, type VaultRow } from '@riftvault/types';
import { api } from '../api';
import { CardThumb } from '../components/CardThumb';

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/** Filterable vault view: totals & completion per set, CSV export. */
export function Vault() {
  const [rows, setRows] = useState<VaultRow[]>([]);
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [filterSet, setFilterSet] = useState('');
  const [filterText, setFilterText] = useState('');
  const [sortByValue, setSortByValue] = useState(false);
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
    const list = rows.filter(
      (row) =>
        (!filterSet || row.set_code === filterSet) &&
        (!text || row.name.toLowerCase().includes(text) || row.id.toLowerCase().includes(text)),
    );
    if (sortByValue) {
      return [...list].sort((a, b) => (rowValue(b) ?? -1) - (rowValue(a) ?? -1));
    }
    return list;
  }, [rows, filterSet, filterText, sortByValue]);

  const totalCards = rows.reduce((n, r) => n + r.qty + r.qty_foil, 0);
  const currency = rows.find((r) => r.currency)?.currency ?? 'USD';
  const pricedRows = rows.filter((r) => rowValue(r) !== null);
  const totalValue = pricedRows.reduce((n, r) => n + (rowValue(r) ?? 0), 0);
  const unpriced = rows.length - pricedRows.length;

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
        <div className="row spread">
          <span>
            <strong>{totalCards}</strong> cards · <strong>{rows.length}</strong> unique
          </span>
          {pricedRows.length > 0 && (
            <span>
              ≈ <strong>{money(totalValue, currency)}</strong>
            </span>
          )}
        </div>
        {pricedRows.length > 0 && unpriced > 0 && (
          <div className="muted">{unpriced} card(s) without a known price aren't counted.</div>
        )}
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
      {pricedRows.length > 0 && (
        <label className="row muted">
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={sortByValue}
            onChange={(e) => setSortByValue(e.target.checked)}
          />
          Sort by value
        </label>
      )}

      {filtered.map((row) => {
        const value = rowValue(row);
        return (
          <div key={row.id} className="cardrow">
            <CardThumb card={row} />
            <div className="info">
              <div className="t">{row.name}</div>
              <div className="s">
                {row.id} · {row.rarity ?? '?'}
                {row.price != null && (
                  <> · {money(row.price, row.currency ?? 'USD')}/ea</>
                )}
                {row.qty_foil > 0 && row.price_foil != null && (
                  <> · ✦{money(row.price_foil, row.currency ?? 'USD')}</>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <strong>×{row.qty}</strong>
              {row.qty_foil > 0 && <div className="badge foil">✦{row.qty_foil}</div>}
              {value !== null && (
                <div className="muted">{money(value, row.currency ?? 'USD')}</div>
              )}
            </div>
          </div>
        );
      })}
      {filtered.length === 0 && <p className="muted">Nothing here yet.</p>}
    </div>
  );
}
