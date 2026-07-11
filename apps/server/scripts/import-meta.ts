/**
 * Import the top N decks from Piltover Archive's deck listing as meta decks.
 *
 *   npm run import-meta                  # top 30 from the default listing
 *   npm run import-meta -- --top 15
 *   npm run import-meta -- --url 'https://piltoverarchive.com/decks?sort=popular'
 *
 * Deck order on the listing page becomes popularity_rank. Idempotent:
 * decks are keyed by source_url, so re-running refreshes ranks and lists
 * instead of duplicating. Re-run whenever the meta shifts (or via cron).
 *
 * NOTE: pass the listing URL you actually browse (with PA's own sort
 * params) via --url if the default page ordering isn't "top decks".
 */
import { getDb } from '../src/db.js';
import { extractDeckLinks, PiltoverArchiveSource } from '../src/lib/deckImport.js';
import { upsertDeckBySourceUrl } from '../src/lib/deckStore.js';
import { parseDecklist } from '../src/lib/parseDecklist.js';
import { resolveDeckEntries } from '../src/lib/resolveDeck.js';

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1]! : null;
}

const listingUrl = arg('--url') ?? 'https://piltoverarchive.com/decks';
const top = Math.max(1, parseInt(arg('--top') ?? '30', 10) || 30);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const db = getDb();
const source = new PiltoverArchiveSource();

/** Page 1 is the URL as given; later pages get ?page=N (or a {page} placeholder). */
function withPage(url: string, page: number): string {
  if (url.includes('{page}')) return url.replace('{page}', String(page));
  if (page === 1) return url;
  const u = new URL(url);
  u.searchParams.set('page', String(page));
  return u.toString();
}

/** Listing pages server-render ~10 decks each — walk pages until we have enough. */
async function collectLinks(): Promise<string[]> {
  const origin = new URL(listingUrl).origin;
  const seen = new Set<string>();
  const links: string[] = [];
  for (let page = 1; links.length < top && page <= 20; page++) {
    const url = withPage(listingUrl, page);
    console.log(`[meta] fetching listing: ${url}`);
    const res = await fetch(url, { headers: { accept: 'text/html' } });
    if (!res.ok) {
      console.warn(`[meta] listing page ${page} → ${res.status}, stopping`);
      break;
    }
    const found = extractDeckLinks(await res.text(), origin);
    let added = 0;
    for (const link of found) {
      if (seen.has(link)) continue;
      seen.add(link);
      links.push(link);
      added++;
    }
    if (added === 0) break; // page param ignored or past the end
    await sleep(300);
  }
  return links.slice(0, top);
}

const links = await collectLinks();
if (links.length === 0) {
  console.error(
    '[meta] no deck links found on that page — if PA loads the list client-side, ' +
      'pass a listing URL that server-renders links (--url), or import decks one by one in the app.',
  );
  process.exit(1);
}
if (links.length < top) {
  console.warn(
    `[meta] only ${links.length} of ${top} decks found — if PA paginates with a ` +
      "different param, browse to page 2 in the browser and pass that URL shape via --url " +
      "(a {page} placeholder is supported, e.g. --url 'https://piltoverarchive.com/decks?p={page}').",
  );
}
console.log(`[meta] found ${links.length} deck link(s), importing…`);

let ok = 0;
let failed = 0;
for (let i = 0; i < links.length; i++) {
  const url = links[i]!;
  try {
    const imported = await source.fetchDeck(url);
    const parsed = parseDecklist(imported.text);
    const resolved = resolveDeckEntries(db, parsed.entries);
    const unresolved = [...parsed.unparsed, ...resolved.unresolved];
    const { created } = upsertDeckBySourceUrl(db, {
      name: imported.name ?? `PA deck ${url.slice(-8)}`,
      kind: 'meta',
      source_url: url,
      archetype: imported.archetype,
      popularity_rank: i + 1,
      source_text: imported.text,
      cards: [...resolved.cards.values()],
      unresolved,
    });
    ok++;
    console.log(
      `[meta] #${String(i + 1).padStart(2)} ${created ? 'added  ' : 'updated'} ${imported.name ?? url}` +
        (unresolved.length > 0 ? `  (${unresolved.length} unresolved)` : ''),
    );
  } catch (err) {
    failed++;
    console.warn(`[meta] #${i + 1} FAILED ${url}: ${(err as Error).message}`);
  }
  await sleep(400); // be polite to PA
}

console.log(`[meta] done: ${ok} imported/updated, ${failed} failed`);
console.log('[meta] open the Buildable screen to see the ranking.');
