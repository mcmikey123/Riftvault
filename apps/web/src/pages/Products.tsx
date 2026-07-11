import { useEffect, useState } from 'react';
import type { Product } from '@riftvault/types';
import { api } from '../api';
import { CardThumb } from '../components/CardThumb';
import { UndoToast } from '../components/UndoToast';

/** Precon one-tap import: list → preview contents → add as one batch. */
export function Products() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ batchId: string; message: string } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.products().then(setProducts).catch((e) => setErr((e as Error).message));
  }, []);

  const add = async (product: Product) => {
    setBusy(true);
    try {
      const result = await api.addProduct(product.id);
      setToast({
        batchId: result.batch_id,
        message: `Added ${product.name} (${product.total_cards} cards)`,
      });
      setOpen(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <h1>Sealed products</h1>
      {err && <p className="error">{err}</p>}
      {products && products.length === 0 && (
        <p className="muted">
          No products seeded. Add verified fixtures to <code>packages/data/products/</code> and
          re-run <code>npm run sync-cards</code> (see the README there — contents must come from
          the real product, never invented).
        </p>
      )}
      {products?.map((product) => (
        <div key={product.id} className="panel stack">
          <div className="row spread">
            <div>
              <strong>{product.name}</strong>
              <div className="muted">
                {product.set_code ?? ''} · {product.total_cards} cards
              </div>
            </div>
            <button className="small" onClick={() => setOpen(open === product.id ? null : product.id)}>
              {open === product.id ? 'hide' : 'preview'}
            </button>
          </div>
          {open === product.id && (
            <>
              <div className="stack">
                {product.cards.map(({ card, qty }) => (
                  <div key={card.id} className="cardrow">
                    <CardThumb card={card} />
                    <div className="info">
                      <div className="t">{card.name}</div>
                      <div className="s">{card.id}</div>
                    </div>
                    <strong>×{qty}</strong>
                  </div>
                ))}
              </div>
              <button className="primary" disabled={busy} onClick={() => add(product)}>
                Add all {product.total_cards} to vault
              </button>
            </>
          )}
        </div>
      ))}
      {toast && (
        <UndoToast batchId={toast.batchId} message={toast.message} onDone={() => setToast(null)} />
      )}
    </div>
  );
}
