import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import type { Db } from './db.js';
import { env } from './env.js';
import { findUserByKey, type User } from './lib/users.js';
import { bulkRoutes } from './routes/bulk.js';
import { cardsRoutes } from './routes/cards.js';
import { decksRoutes } from './routes/decks.js';
import { imgRoutes } from './routes/img.js';
import { productsRoutes } from './routes/products.js';
import { recommendationsRoutes } from './routes/recommendations.js';
import { scanRoutes } from './routes/scan.js';
import { vaultRoutes } from './routes/vault.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};

type AppEnv = { Variables: { user: User } };

export function createApp(db: Db) {
  const app = new Hono<AppEnv>();

  // Registered before the auth middleware so uptime checks don't need a key.
  app.get('/api/health', (c) => c.json({ ok: true }));

  // Multi-user: the access key IS the identity. Cards/products/meta decks
  // are shared; vault, history and personal decks are scoped to the user.
  app.use('/api/*', async (c, next) => {
    const user = findUserByKey(db, c.req.header('x-vault-key') ?? '');
    if (!user) {
      return c.json(
        { error: 'unauthorized — enter your access key (ask the owner, or run: npm run add-user)' },
        401,
      );
    }
    c.set('user', user);
    await next();
  });

  app.get('/api/me', (c) => {
    const user = c.get('user');
    return c.json({ id: user.id, name: user.name });
  });

  const api = new Hono<AppEnv>();
  api.route('/', cardsRoutes(db));
  api.route('/', vaultRoutes(db));
  api.route('/', productsRoutes(db));
  api.route('/', bulkRoutes(db));
  api.route('/', decksRoutes(db));
  api.route('/', recommendationsRoutes(db));
  api.route('/', scanRoutes(db));
  app.route('/api', api);

  app.route('/', imgRoutes(db));

  // Static PWA (production build). SPA fallback to index.html.
  app.get('*', (c) => {
    if (!fs.existsSync(env.webDist)) {
      return c.text('Web app not built. Run: npm run build -w apps/web', 404);
    }
    const urlPath = decodeURIComponent(new URL(c.req.url).pathname);
    const safe = path.normalize(urlPath).replace(/^([/\\]|\.\.)+/, '');
    let file = path.join(env.webDist, safe);
    if (!file.startsWith(env.webDist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(env.webDist, 'index.html');
    }
    const ext = path.extname(file).toLowerCase();
    c.header('Content-Type', MIME[ext] ?? 'application/octet-stream');
    if (ext && ext !== '.html' && ext !== '.webmanifest' && safe.includes('assets/')) {
      c.header('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      c.header('Cache-Control', 'no-cache');
    }
    return c.body(new Uint8Array(fs.readFileSync(file)));
  });

  return app;
}
