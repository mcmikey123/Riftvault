import { Hono } from 'hono';
import type { Card } from '@riftvault/types';
import type { Db } from '../db.js';
import type { User } from '../lib/users.js';
import { applyAdjustments } from '../lib/vaultStore.js';

type AppEnv = { Variables: { user: User } };

export function productsRoutes(db: Db) {
  const app = new Hono<AppEnv>();

  const contents = (productId: string) =>
    db
      .prepare(
        `SELECT pc.qty, c.id, c.set_code, c.collector_number, c.name, c.type, c.faction, c.rarity, c.image_url
         FROM product_cards pc JOIN cards c ON c.id = pc.card_id
         WHERE pc.product_id = ? ORDER BY c.set_code, c.collector_number`,
      )
      .all(productId) as (Card & { qty: number })[];

  app.get('/products', (c) => {
    const products = db
      .prepare('SELECT id, name, set_code FROM products ORDER BY name')
      .all() as { id: string; name: string; set_code: string | null }[];
    return c.json(
      products.map((p) => {
        const cards = contents(p.id).map(({ qty, ...card }) => ({ card, qty }));
        return {
          ...p,
          cards,
          total_cards: cards.reduce((sum, row) => sum + row.qty, 0),
        };
      }),
    );
  });

  app.post('/vault/add-product', async (c) => {
    const body = (await c.req.json()) as { product_id?: string };
    if (!body.product_id) return c.json({ error: 'product_id required' }, 400);
    const product = db.prepare('SELECT id, name FROM products WHERE id = ?').get(body.product_id);
    if (!product) return c.json({ error: 'unknown product' }, 404);
    const cards = contents(body.product_id);
    if (cards.length === 0) return c.json({ error: 'product has no contents' }, 400);
    const result = applyAdjustments(
      db,
      c.get('user').id,
      cards.map((row) => ({ card_id: row.id, delta: row.qty })),
      'product',
    );
    return c.json(result);
  });

  return app;
}
