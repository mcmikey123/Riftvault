import { normalizeName } from './normalize.js';

/**
 * riftbound.gg meta tier list (https://riftbound.gg/tier-list/ — WordPress,
 * server-rendered, verified 2026-07). The page is a linear document: "Tier N"
 * headings followed by links to champion guide pages
 * (…/rengar-pridestalker-guide/). Champion→tier falls out of scanning those
 * two token kinds in order. Guides carry no decklists (verified), so tiers
 * from here get joined onto Piltover Archive decks by champion.
 */

export interface TierEntry {
  /** Guide slug without the trailing -guide, e.g. 'rengar-pridestalker'. */
  slug: string;
  /** Normalised text of the slug: 'rengar pridestalker'. */
  text: string;
  tier: number;
}

/** Pure, unit-tested: ordered scan of tier markers and guide links. */
export function extractTierList(html: string): TierEntry[] {
  const tokenRe = /Tier\s*([1-5])\b|href="https:\/\/riftbound\.gg\/([a-z0-9-]+)-guide\/?"/g;
  let current: number | null = null;
  const bySlug = new Map<string, number>();
  for (const m of html.matchAll(tokenRe)) {
    if (m[1]) {
      current = parseInt(m[1], 10);
    } else if (m[2] && current !== null) {
      // first placement wins (image + text link duplicates, later mentions)
      if (!bySlug.has(m[2])) bySlug.set(m[2], current);
    }
  }
  return [...bySlug.entries()].map(([slug, tier]) => ({
    slug,
    text: normalizeName(slug.replace(/-/g, ' ')),
    tier,
  }));
}

/**
 * Does a tier entry describe this deck? Matched when any card name in the
 * deck overlaps the guide slug ("Loose Cannon" ⊂ "jinx loose cannon", or
 * champion unit "Jinx - Loose Cannon" == slug text), or the deck's name
 * contains the champion's first name as a word ("Meta Killer Jinx").
 */
export function entryMatchesDeck(
  entry: TierEntry,
  deckCardNamesNorm: string[],
  deckNameNorm: string,
): boolean {
  for (const cardName of deckCardNamesNorm) {
    if (cardName.length < 4) continue;
    if (entry.text.includes(cardName) || cardName.includes(entry.text)) return true;
  }
  const firstToken = entry.text.split(' ')[0]!;
  if (firstToken.length >= 2 && new RegExp(`\\b${firstToken}\\b`).test(deckNameNorm)) return true;
  return false;
}

/** Best (lowest) tier across matching entries, with the matched entry. */
export function deckTier(
  entries: TierEntry[],
  deckCardNamesNorm: string[],
  deckNameNorm: string,
): TierEntry | null {
  let best: TierEntry | null = null;
  for (const entry of entries) {
    if (!entryMatchesDeck(entry, deckCardNamesNorm, deckNameNorm)) continue;
    if (!best || entry.tier < best.tier) best = entry;
  }
  return best;
}

export async function fetchTierList(base = 'https://riftbound.gg'): Promise<TierEntry[]> {
  const res = await fetch(`${base.replace(/\/$/, '')}/tier-list/`, {
    headers: {
      accept: 'text/html',
      'user-agent': 'riftbound-vault/0.1 (personal collection tracker)',
    },
  });
  if (!res.ok) throw new Error(`GET ${base}/tier-list/ → ${res.status}`);
  return extractTierList(await res.text());
}
