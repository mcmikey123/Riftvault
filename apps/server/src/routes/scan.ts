import { Hono } from 'hono';
import type { ScanResponse } from '@riftvault/types';
import type { Db } from '../db.js';
import { env } from '../env.js';
import { buildCardIndex, resolveExtractions } from '../lib/resolveScan.js';
import { runScan, type ScanImage } from '../lib/scan.js';
import { allCards } from '../lib/search.js';

const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function bumpUsage(db: Db, inputTokens: number, outputTokens: number) {
  const date = new Date().toISOString().slice(0, 10);
  db.prepare(
    `INSERT INTO scan_usage (date, requests, input_tokens, output_tokens)
     VALUES (?, 1, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       requests = requests + 1,
       input_tokens = input_tokens + excluded.input_tokens,
       output_tokens = output_tokens + excluded.output_tokens`,
  ).run(date, inputTokens, outputTokens);
  return db.prepare('SELECT * FROM scan_usage WHERE date = ?').get(date) as ScanResponse['usage'];
}

export function scanRoutes(db: Db) {
  const app = new Hono();

  app.get('/scan/usage', (c) => {
    const date = new Date().toISOString().slice(0, 10);
    const row =
      (db.prepare('SELECT * FROM scan_usage WHERE date = ?').get(date) as
        | ScanResponse['usage']
        | undefined) ?? { date, requests: 0, input_tokens: 0, output_tokens: 0 };
    return c.json(row);
  });

  /**
   * Multipart image upload → vision extraction → validated candidates.
   * Never writes to the vault; the client commits the confirmed batch via
   * POST /api/vault/adjust with source 'scan'.
   */
  app.post('/scan', async (c) => {
    if (!env.anthropicKey) {
      return c.json({ error: 'ANTHROPIC_API_KEY not configured on the server' }, 503);
    }
    const body = await c.req.parseBody({ all: true });
    const filesRaw = body['images'] ?? body['image'];
    const files = (Array.isArray(filesRaw) ? filesRaw : [filesRaw]).filter(
      (f): f is File => f instanceof File,
    );
    if (files.length === 0) return c.json({ error: 'no images uploaded' }, 400);
    if (files.length > MAX_IMAGES) return c.json({ error: `max ${MAX_IMAGES} images` }, 400);

    const images: ScanImage[] = [];
    for (const file of files) {
      if (!MEDIA_TYPES.has(file.type)) {
        return c.json({ error: `unsupported image type ${file.type}` }, 400);
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return c.json({ error: 'image too large — client should resize to ~1600px' }, 400);
      }
      images.push({
        data: Buffer.from(await file.arrayBuffer()),
        mediaType: file.type as ScanImage['mediaType'],
      });
    }

    const model = body['model'] === 'fallback' ? env.scanModelFallback : env.scanModel;
    let result;
    try {
      result = await runScan(images, model, env.anthropicKey);
    } catch (err) {
      return c.json({ error: `vision request failed: ${(err as Error).message}` }, 502);
    }

    const usage = bumpUsage(db, result.input_tokens, result.output_tokens);
    const index = buildCardIndex(allCards(db));
    const candidates = resolveExtractions(result.extractions, index);
    return c.json({ candidates, usage, model } satisfies ScanResponse);
  });

  return app;
}
