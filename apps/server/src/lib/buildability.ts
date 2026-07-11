import type { Card, DeckScore, DiffRow, MostWantedRow } from '@riftvault/types';

/**
 * Buildability scoring — pure functions, unit tested.
 * Foils count toward completion (the caller passes have = qty + qty_foil).
 */

/** Rarity → cost weight. Tune here, nowhere else. Unknown rarities get DEFAULT_RARITY_WEIGHT. */
export const RARITY_WEIGHTS: Record<string, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 8,
  legendary: 12,
};
export const DEFAULT_RARITY_WEIGHT = 3;

/** Decks at or above this completion get the "nearly there" badge. */
export const NEARLY_THERE_THRESHOLD = 0.9;

export function rarityWeight(rarity: string | null | undefined): number {
  if (!rarity) return DEFAULT_RARITY_WEIGHT;
  return RARITY_WEIGHTS[rarity.toLowerCase()] ?? DEFAULT_RARITY_WEIGHT;
}

export interface DeckRequirement {
  card: Card;
  need: number;
  have: number; // already capped-uncapped raw owned copies (qty + qty_foil)
}

export interface Score {
  completion: number;
  missing_count: number;
  missing_unique: number;
  cost_proxy: number;
  ready: boolean;
  nearly_there: boolean;
  missing: DiffRow[];
  have: DiffRow[];
}

export function scoreDeck(rows: DeckRequirement[]): Score {
  let required = 0;
  let owned = 0;
  let missing_count = 0;
  let missing_unique = 0;
  let cost_proxy = 0;
  const missing: DiffRow[] = [];
  const have: DiffRow[] = [];

  for (const { card, need, have: rawHave } of rows) {
    const capped = Math.min(rawHave, need);
    required += need;
    owned += capped;
    const short = need - capped;
    if (short > 0) {
      missing_count += short;
      missing_unique += 1;
      cost_proxy += short * rarityWeight(card.rarity);
      missing.push({ card, need, have: rawHave });
    } else {
      have.push({ card, need, have: rawHave });
    }
  }

  const completion = required === 0 ? 0 : owned / required;
  return {
    completion,
    missing_count,
    missing_unique,
    cost_proxy,
    ready: required > 0 && missing_count === 0,
    nearly_there: completion >= NEARLY_THERE_THRESHOLD && missing_count > 0,
    missing,
    have,
  };
}

/** Highest completion first, cost_proxy as tiebreaker (cheaper to finish wins). */
export function rankDecks(scores: DeckScore[]): DeckScore[] {
  return [...scores].sort(
    (a, b) =>
      b.completion - a.completion ||
      a.cost_proxy - b.cost_proxy ||
      (a.deck.popularity_rank ?? Infinity) - (b.deck.popularity_rank ?? Infinity),
  );
}

/**
 * Aggregate "most wanted": cards appearing in the missing lists of the most
 * near-complete decks. Each deck contributes its completion as weight
 * (counted once per deck, regardless of copies), so a card blocking three
 * 90% decks outranks one blocking a single 95% deck.
 */
export function mostWanted(scores: DeckScore[]): MostWantedRow[] {
  const byCard = new Map<string, MostWantedRow>();
  for (const score of scores) {
    for (const row of score.missing) {
      const shortBy = row.need - Math.min(row.have, row.need);
      if (shortBy <= 0) continue;
      const existing = byCard.get(row.card.id);
      if (existing) {
        existing.decks_count += 1;
        existing.copies_needed_total += shortBy;
        existing.weight += score.completion;
      } else {
        byCard.set(row.card.id, {
          card: row.card,
          decks_count: 1,
          copies_needed_total: shortBy,
          weight: score.completion,
        });
      }
    }
  }
  return [...byCard.values()].sort(
    (a, b) => b.weight - a.weight || b.decks_count - a.decks_count || a.card.id.localeCompare(b.card.id),
  );
}
