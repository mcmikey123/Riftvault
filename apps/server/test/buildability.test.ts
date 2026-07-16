import { describe, expect, it } from 'vitest';
import type { DeckScore } from '@riftvault/types';
import {
  mostWanted,
  rankDecks,
  rarityWeight,
  scoreDeck,
} from '../src/lib/buildability.js';
import { makeCard } from './fixtures.js';

const common = makeCard({ name: 'Common Card', rarity: 'common' });
const rare = makeCard({ name: 'Rare Card', rarity: 'rare' });
const epic = makeCard({ name: 'Epic Card', rarity: 'epic' });

describe('scoreDeck', () => {
  it('computes completion, missing counts and cost proxy (hand-checked)', () => {
    // Deck: 3x common (have 3), 3x rare (have 1), 2x epic (have 0) → need 8, own 4
    const s = scoreDeck([
      { card: common, need: 3, have: 3 },
      { card: rare, need: 3, have: 1 },
      { card: epic, need: 2, have: 0 },
    ]);
    expect(s.completion).toBeCloseTo(4 / 8);
    expect(s.missing_count).toBe(4); // 2 rare + 2 epic
    expect(s.missing_unique).toBe(2);
    expect(s.cost_proxy).toBe(2 * rarityWeight('rare') + 2 * rarityWeight('epic')); // 2*3 + 2*8 = 22
    expect(s.ready).toBe(false);
    expect(s.nearly_there).toBe(false);
  });

  it('caps per-card contribution at required qty (extras do not inflate)', () => {
    const s = scoreDeck([
      { card: common, need: 2, have: 10 },
      { card: rare, need: 2, have: 0 },
    ]);
    expect(s.completion).toBeCloseTo(0.5);
  });

  it('marks 100% decks ready', () => {
    const s = scoreDeck([{ card: common, need: 3, have: 3 }]);
    expect(s.ready).toBe(true);
    expect(s.nearly_there).toBe(false);
    expect(s.completion).toBe(1);
  });

  it('badges >=90% decks as nearly there', () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({
      card: makeCard({ name: `Filler ${i}` }),
      need: 1,
      have: 1,
    }));
    rows.push({ card: rare, need: 1, have: 0 });
    const s = scoreDeck(rows);
    expect(s.completion).toBeCloseTo(0.9);
    expect(s.nearly_there).toBe(true);
  });

  it('uses the default weight for unknown rarities', () => {
    const weird = makeCard({ name: 'Weird', rarity: 'mythic-showcase' });
    const s = scoreDeck([{ card: weird, need: 1, have: 0 }]);
    expect(s.cost_proxy).toBe(rarityWeight('mythic-showcase'));
    expect(s.cost_proxy).toBe(3);
  });
});

function fakeScore(id: number, completion: number, cost: number, missing: DeckScore['missing'] = []): DeckScore {
  return {
    deck: { id, name: `Deck ${id}`, kind: 'meta', archetype: null, popularity_rank: null, source_url: null },
    completion,
    missing_count: missing.reduce((n, r) => n + (r.need - Math.min(r.have, r.need)), 0),
    missing_unique: missing.length,
    cost_proxy: cost,
    ready: completion === 1,
    nearly_there: completion >= 0.9 && completion < 1,
    missing,
  };
}

describe('rankDecks', () => {
  it('ranks by completion desc then cost_proxy asc when untiered', () => {
    const ranked = rankDecks([
      fakeScore(1, 0.8, 10),
      fakeScore(2, 0.95, 20),
      fakeScore(3, 0.95, 5),
      fakeScore(4, 1, 0),
    ]);
    expect(ranked.map((r) => r.deck.id)).toEqual([4, 3, 2, 1]);
  });

  it('ranks meta tier first: a T1 deck beats a more complete T5 deck', () => {
    const t5 = fakeScore(1, 1, 0);
    t5.deck.meta_tier = 5;
    const t1 = fakeScore(2, 0.4, 50);
    t1.deck.meta_tier = 1;
    const unrated = fakeScore(3, 1, 0); // meta_tier undefined → sinks last
    const ranked = rankDecks([t5, unrated, t1]);
    expect(ranked.map((r) => r.deck.id)).toEqual([2, 1, 3]);
  });
});

describe('mostWanted', () => {
  it('matches a hand-computed aggregate', () => {
    // rare blocks two decks (0.95 + 0.9 weight = 1.85), epic blocks one 0.95 deck
    const scores = [
      fakeScore(1, 0.95, 0, [
        { card: rare, need: 3, have: 1 },
        { card: epic, need: 2, have: 0 },
      ]),
      fakeScore(2, 0.9, 0, [{ card: rare, need: 2, have: 0 }]),
      fakeScore(3, 0.4, 0, [{ card: common, need: 4, have: 0 }]),
    ];
    const wanted = mostWanted(scores);
    expect(wanted[0]!.card.id).toBe(rare.id);
    expect(wanted[0]!.decks_count).toBe(2);
    expect(wanted[0]!.copies_needed_total).toBe(4); // (3-1) + 2
    expect(wanted[0]!.weight).toBeCloseTo(1.85);
    expect(wanted[1]!.card.id).toBe(epic.id);
    expect(wanted[1]!.weight).toBeCloseTo(0.95);
    expect(wanted[2]!.card.id).toBe(common.id);
  });
});
