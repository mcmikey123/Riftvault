import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type DeckJson } from '../api';

export function Decks() {
  const [decks, setDecks] = useState<DeckJson[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'mine' | 'meta'>('mine');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [rank, setRank] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const reload = () => api.decks().then(setDecks).catch((e) => setErr((e as Error).message));
  useEffect(() => {
    void reload();
  }, []);

  const create = async () => {
    setBusy(true);
    setErr('');
    try {
      const deck = await api.createDeck({
        name: name || undefined,
        kind,
        text: text.trim() || undefined,
        url: url.trim() || undefined,
        popularity_rank: rank ? parseInt(rank, 10) : undefined,
      });
      setShowForm(false);
      setName('');
      setText('');
      setUrl('');
      setRank('');
      await reload();
      if (deck.unresolved.length > 0) {
        setErr(`Imported with ${deck.unresolved.length} unresolved line(s) — open the deck to fix them.`);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const mine = decks?.filter((d) => d.kind === 'mine') ?? [];
  const meta = decks?.filter((d) => d.kind === 'meta') ?? [];

  const deckRow = (deck: DeckJson) => (
    <Link key={deck.id} to={`/decks/${deck.id}`} className="panel row spread">
      <div>
        <strong>{deck.name}</strong>
        <div className="muted">
          {deck.card_count} cards
          {deck.archetype ? ` · ${deck.archetype}` : ''}
          {deck.unresolved.length > 0 && (
            <span className="badge amber" style={{ marginLeft: 6 }}>
              {deck.unresolved.length} unresolved
            </span>
          )}
        </div>
      </div>
      <span className="muted">→</span>
    </Link>
  );

  return (
    <div className="stack">
      <div className="row spread">
        <h1 style={{ margin: 0 }}>Decks</h1>
        <button className="primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Close' : '+ Import'}
        </button>
      </div>
      {err && <p className="error">{err}</p>}

      {showForm && (
        <div className="panel stack">
          <input placeholder="Deck name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="row">
            <select value={kind} onChange={(e) => setKind(e.target.value as 'mine' | 'meta')}>
              <option value="mine">My deck</option>
              <option value="meta">Meta deck</option>
            </select>
            {kind === 'meta' && (
              <input
                placeholder="Popularity rank (optional)"
                inputMode="numeric"
                value={rank}
                onChange={(e) => setRank(e.target.value)}
              />
            )}
          </div>
          <input
            placeholder="…or Piltover Archive deck URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <textarea
            placeholder={'Paste decklist:\n3 Void Gate\n2x Hextech Forge\nJinx, Loose Cannon\n3 OGN-112'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="primary" disabled={busy || (!text.trim() && !url.trim())} onClick={create}>
            Import deck
          </button>
        </div>
      )}

      <h2>My decks ({mine.length})</h2>
      {mine.map(deckRow)}
      <h2>Meta decks ({meta.length})</h2>
      {meta.map(deckRow)}
      {meta.length === 0 && (
        <p className="muted">
          Paste top Piltover Archive lists as “Meta deck” to power the Buildable screen.
        </p>
      )}
    </div>
  );
}
