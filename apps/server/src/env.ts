import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

const dataDir = process.env.DATA_DIR || path.join(repoRoot, 'data');

export const env = {
  port: Number(process.env.PORT || 8787),
  dataDir,
  dbPath: process.env.DB_PATH || path.join(dataDir, 'vault.db'),
  imgCacheDir: process.env.IMG_CACHE_DIR || path.join(dataDir, 'img-cache'),
  /** Shared secret; when set, /api/* requires the `x-vault-key` header. */
  vaultKey: process.env.VAULT_KEY || '',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  scanModel: process.env.SCAN_MODEL || 'claude-haiku-4-5',
  scanModelFallback: process.env.SCAN_MODEL_FALLBACK || 'claude-sonnet-4-6',
  cardSource: process.env.CARD_SOURCE || 'riftscribe',
  riftscribeBase: process.env.RIFTSCRIBE_BASE || 'https://riftscribe.gg',
  priceSource: process.env.PRICE_SOURCE || 'tcgcsv',
  tcgcsvBase: process.env.TCGCSV_BASE || 'https://tcgcsv.com',
  /** TCGplayer category id for Riftbound on tcgcsv.com (verified 2026-07). */
  tcgcsvCategoryId: Number(process.env.TCGCSV_CATEGORY_ID || 89),
  productsDir:
    process.env.PRODUCTS_DIR || path.join(repoRoot, 'packages/data/products'),
  webDist: process.env.WEB_DIST || path.join(repoRoot, 'apps/web/dist'),
};
