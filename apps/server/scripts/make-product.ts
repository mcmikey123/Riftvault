/**
 * Turn a decklist (pasted from Piltover Archive, the official product page,
 * or the deck's insert) into a product fixture in packages/data/products/,
 * so the precon becomes a one-tap add on the Products screen.
 *
 * Usage:
 *   npm run make-product -- --id ogn-champion-deck-jinx \
 *     --name "Jinx Champion Deck" --set OGN --file /tmp/jinx.txt
 *
 * Omit --file to read the decklist from stdin (paste, then Ctrl-D).
 * Every line must resolve against the local card DB — unresolved lines
 * abort the script (fix them using explicit IDs, e.g. "3 OGN-045"), so a
 * fixture can never contain invented contents. Re-run sync-cards afterwards
 * to seed it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../src/db.js';
import { env } from '../src/env.js';
import { parseDecklist } from '../src/lib/parseDecklist.js';
import { resolveDeckEntries } from '../src/lib/resolveDeck.js';

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1]! : null;
}

const id = arg('--id');
const name = arg('--name');
const set = arg('--set');
const file = arg('--file');

if (!id || !name) {
  console.error('usage: npm run make-product -- --id <slug> --name "<Product Name>" [--set OGN] [--file decklist.txt]');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
  console.error(`--id must be a lowercase slug, got '${id}'`);
  process.exit(1);
}

const text = file ? fs.readFileSync(file, 'utf8') : fs.readFileSync(0, 'utf8');
if (!text.trim()) {
  console.error('no decklist provided (use --file or pipe/paste via stdin)');
  process.exit(1);
}

const db = getDb();
const parsed = parseDecklist(text);
const resolved = resolveDeckEntries(db, parsed.entries);
const problems = [...parsed.unparsed, ...resolved.unresolved];

if (problems.length > 0) {
  console.error('These lines did not resolve — fix them (explicit IDs like "3 OGN-045" always work):');
  for (const line of problems) console.error(`  ✗ ${line}`);
  process.exit(1);
}
if (resolved.cards.size === 0) {
  console.error('decklist resolved to zero cards');
  process.exit(1);
}

const cards = [...resolved.cards.values()]
  .sort((a, b) => a.card.set_code.localeCompare(b.card.set_code) || a.card.collector_number - b.card.collector_number)
  .map(({ card, qty }) => ({ card_id: card.id, qty }));

const fixture = {
  product_id: id,
  name,
  set_code: set?.toUpperCase() ?? null,
  cards,
};

fs.mkdirSync(env.productsDir, { recursive: true });
const outPath = path.join(env.productsDir, `${id}.json`);
fs.writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`);

const total = cards.reduce((n, c) => n + c.qty, 0);
console.log(`wrote ${outPath}`);
console.log(`${name}: ${cards.length} distinct cards, ${total} total`);
for (const { card, qty } of resolved.cards.values()) {
  console.log(`  ${String(qty).padStart(2)}× ${card.id}  ${card.name}`);
}
console.log('\nnow run: npm run sync-cards   (seeds it into the Products screen)');
