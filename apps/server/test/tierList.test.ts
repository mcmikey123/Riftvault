import { describe, expect, it } from 'vitest';
import { deckTier, entryMatchesDeck, extractTierList } from '../src/lib/tierList.js';

// Mirrors the real page: nav "Tier List" text, a TOC with Tier mentions
// before content, then Tier headings each followed by duplicated guide links.
const PAGE = `
<nav><a href="https://riftbound.gg/tier-list/">Tier List</a></nav>
<ul><li><a href="#Tier_Explanations">1.1 Tier Explanations</a></li></ul>
<h2>Tier 1</h2>
<a href="https://riftbound.gg/diana-scorn-of-the-moon-guide/"><img/></a>
<a href="https://riftbound.gg/diana-scorn-of-the-moon-guide/">Diana</a>
<a href="https://riftbound.gg/leblanc-deceiver-guide/">LeBlanc</a>
<h2>Tier 2</h2>
<a href="https://riftbound.gg/rengar-pridestalker-guide/">Rengar</a>
<a href="https://riftbound.gg/master-yi-wuju-master-guide/">Yi</a>
<h2>Tier 5</h2>
<a href="https://riftbound.gg/jinx-loose-cannon-guide/">Jinx</a>
`;

describe('extractTierList', () => {
  it('maps champions to tiers in document order, deduped', () => {
    const entries = extractTierList(PAGE);
    expect(entries).toEqual([
      { slug: 'diana-scorn-of-the-moon', text: 'diana scorn of the moon', tier: 1 },
      { slug: 'leblanc-deceiver', text: 'leblanc deceiver', tier: 1 },
      { slug: 'rengar-pridestalker', text: 'rengar pridestalker', tier: 2 },
      { slug: 'master-yi-wuju-master', text: 'master yi wuju master', tier: 2 },
      { slug: 'jinx-loose-cannon', text: 'jinx loose cannon', tier: 5 },
    ]);
  });

  it('ignores links before any tier heading and returns empty for unrelated pages', () => {
    expect(extractTierList('<a href="https://riftbound.gg/lux-guide/">x</a>')).toEqual([]);
    expect(extractTierList('<p>hello</p>')).toEqual([]);
  });
});

const entries = extractTierList(PAGE);

describe('entryMatchesDeck / deckTier', () => {
  const jinx = entries.find((e) => e.slug === 'jinx-loose-cannon')!;

  it('matches via a legend card name contained in the slug', () => {
    expect(entryMatchesDeck(jinx, ['loose cannon'], 'utrecht winner')).toBe(true);
  });

  it('matches via a champion-unit name equal to the slug', () => {
    expect(entryMatchesDeck(jinx, ['jinx loose cannon'], 'whatever')).toBe(true);
  });

  it('matches via the champion first name as a word in the deck name', () => {
    expect(entryMatchesDeck(jinx, [], 'meta killer jinx')).toBe(true);
    expect(entryMatchesDeck(jinx, [], 'jinxed dreams')).toBe(false); // word boundary
  });

  it('ignores short card names that would false-positive on includes', () => {
    const diana = entries.find((e) => e.slug === 'diana-scorn-of-the-moon')!;
    expect(entryMatchesDeck(diana, ['of'], 'unrelated')).toBe(false);
  });

  it('deckTier picks the best (lowest) tier across matches', () => {
    // deck containing both a Diana legend and a Rengar unit → tier 1 wins
    const best = deckTier(entries, ['scorn of the moon', 'rengar pridestalker'], 'x');
    expect(best?.slug).toBe('diana-scorn-of-the-moon');
    expect(best?.tier).toBe(1);
  });

  it('deckTier returns null when nothing matches', () => {
    expect(deckTier(entries, ['random card'], 'random deck')).toBeNull();
  });
});
