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

// --clear wipes all meta decks before importing; --clear-only just wipes.
if (process.argv.includes('--clear') || process.argv.includes('--clear-only')) {
  const wiped = db.transaction(() => {
    db.prepare(
      "DELETE FROM deck_cards WHERE deck_id IN (SELECT id FROM decks WHERE kind = 'meta')",
    ).run();
    return db.prepare("DELETE FROM decks WHERE kind = 'meta'").run().changes;
  })();
  console.log(`[meta] cleared ${wiped} meta deck(s)`);
  if (process.argv.includes('--clear-only')) process.exit(0);
}

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

// ---- Archetype tagging ------------------------------------------------------
const legendPattern = (() => {
  for (const pattern of ['%legend%', '%champion%']) {
    const n = db
      .prepare("SELECT COUNT(*) AS n FROM cards WHERE lower(COALESCE(type,'')) LIKE ?")
      .get(pattern) as { n: number };
    if (n.n > 0) return pattern;
  }
  return null;
})();

if (legendPattern) {
  db.prepare(
    `UPDATE decks SET archetype = (
       SELECT c.name FROM deck_cards dc JOIN cards c ON c.id = dc.card_id
       WHERE dc.deck_id = decks.id AND lower(COALESCE(c.type,'')) LIKE ?
       ORDER BY c.set_code, c.collector_number LIMIT 1
     )
     WHERE kind = 'meta' AND archetype IS NULL`,
  ).run(legendPattern);
}

// ---- Tiers from riftbound.gg ------------------------------------------------
// Requirements: the meta pool is tier 1–4 champions; every champion on the
// tier list keeps at least one deck (tier-5 champions keep exactly their
// best-ranked deck). Decks matching no tier-list champion are kept but
// unranked — deleting on a failed match would silently lose real decks.
try {
  const { fetchTierList, deckTier } = await import('../src/lib/tierList.js');
  const { normalizeName } = await import('../src/lib/normalize.js');
  const entries = await fetchTierList();
  if (entries.length === 0) throw new Error('tier list parsed to zero entries');
  console.log(
    `[meta] riftbound.gg tier list: ${entries.length} champions — ` +
      entries.map((e) => `${e.slug}=T${e.tier}`).join(', '),
  );

  const metaDecks = db
    .prepare("SELECT id, name, popularity_rank FROM decks WHERE kind = 'meta'")
    .all() as { id: number; name: string; popularity_rank: number | null }[];

  const byChampion = new Map<string, { id: number; rank: number; tier: number }[]>();
  let unmatched = 0;
  const setTier = db.prepare('UPDATE decks SET meta_tier = ? WHERE id = ?');
  for (const deck of metaDecks) {
    const cardNames = (
      db
        .prepare(
          'SELECT c.name FROM deck_cards dc JOIN cards c ON c.id = dc.card_id WHERE dc.deck_id = ?',
        )
        .all(deck.id) as { name: string }[]
    ).map((r) => normalizeName(r.name));
    const match = deckTier(entries, cardNames, normalizeName(deck.name));
    if (match) {
      setTier.run(match.tier, deck.id);
      const list = byChampion.get(match.slug) ?? [];
      list.push({ id: deck.id, rank: deck.popularity_rank ?? 9999, tier: match.tier });
      byChampion.set(match.slug, list);
    } else {
      setTier.run(null, deck.id);
      unmatched++;
    }
  }

  // Prune: tier-5 champions keep only their best-ranked deck.
  let pruned = 0;
  const deleteDeck = db.transaction((id: number) => {
    db.prepare('DELETE FROM deck_cards WHERE deck_id = ?').run(id);
    db.prepare('DELETE FROM decks WHERE id = ?').run(id);
  });
  for (const [, decks] of byChampion) {
    if (decks[0]!.tier <= 4 || decks.length <= 1) continue;
    const sorted = [...decks].sort((a, b) => a.rank - b.rank);
    for (const extra of sorted.slice(1)) {
      deleteDeck(extra.id);
      pruned++;
    }
  }
  if (pruned > 0) console.log(`[meta] pruned ${pruned} extra deck(s) of tier-5 champions`);
  if (unmatched > 0) {
    console.log(`[meta] ${unmatched} deck(s) matched no tier-list champion (kept, unranked)`);
  }

  // Coverage against THE tier list (the champions that matter).
  console.log('[meta] tier-list coverage:');
  const missing: string[] = [];
  for (const entry of [...entries].sort((a, b) => a.tier - b.tier)) {
    const count = byChampion.get(entry.slug)?.length ?? 0;
    console.log(`  T${entry.tier} ${entry.slug.padEnd(34)} ${count} deck(s)${count === 0 ? '  ← MISSING' : ''}`);
    if (count === 0) missing.push(entry.slug);
  }
  if (missing.length > 0) {
    console.log(
      '[meta] to fill the missing champions: import one PA deck URL each in the app ' +
        '(Decks → + Import → Meta deck), then re-run this script to re-tier.',
    );
  }
} catch (err) {
  console.warn(`[meta] tier list unavailable: ${(err as Error).message} — decks left untiered`);
}
console.log('[meta] open the Buildable screen to see the ranking.');
