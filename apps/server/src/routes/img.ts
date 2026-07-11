import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import type { Db } from '../db.js';
import { env } from '../env.js';

/**
 * Thumbnail cache: hotlink RiftScribe sparingly — fetch each card image
 * once, resize to ~300px wide webp, serve from disk forever after.
 * Unauthenticated (plain <img> tags can't send the vault key header);
 * Caddy basic auth still fronts it in production.
 */
export function imgRoutes(db: Db) {
  const app = new Hono();
  const inflight = new Map<string, Promise<Buffer | null>>();

  async function materialize(cardId: string, file: string): Promise<Buffer | null> {
    const row = db.prepare('SELECT image_url FROM cards WHERE id = ?').get(cardId) as
      | { image_url: string | null }
      | undefined;
    if (!row?.image_url) return null;
    const res = await fetch(row.image_url);
    if (!res.ok) return null;
    const original = Buffer.from(await res.arrayBuffer());
    const { default: sharp } = await import('sharp');
    const thumb = await sharp(original).resize({ width: 300 }).webp({ quality: 80 }).toBuffer();
    fs.mkdirSync(env.imgCacheDir, { recursive: true });
    fs.writeFileSync(file, thumb);
    return thumb;
  }

  app.get('/img/:file', async (c) => {
    const m = c.req.param('file').match(/^([A-Za-z0-9-]+)\.webp$/);
    if (!m) return c.notFound();
    const cardId = m[1]!;
    const file = path.join(env.imgCacheDir, `${cardId}.webp`);

    let buf: Buffer | null = null;
    if (fs.existsSync(file)) {
      buf = fs.readFileSync(file);
    } else {
      let job = inflight.get(cardId);
      if (!job) {
        job = materialize(cardId, file).finally(() => inflight.delete(cardId));
        inflight.set(cardId, job);
      }
      try {
        buf = await job;
      } catch {
        buf = null;
      }
    }
    if (!buf) return c.notFound();
    c.header('Content-Type', 'image/webp');
    c.header('Cache-Control', 'public, max-age=2592000, immutable');
    return c.body(new Uint8Array(buf));
  });

  return app;
}
