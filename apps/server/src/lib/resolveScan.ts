import type { Card, Candidate, ScanExtraction } from '@riftvault/types';
import { makeCardId } from './cardId.js';
import { normalizeName } from './normalize.js';
import { similarity } from './trigram.js';

/**
 * Scan validation layer — pure and unit-tested. Matches vision-extracted
 * card names (name-primary, collector number as optional tiebreaker)
 * against the local card table, tolerant of 1–2 character OCR misses.
 * Never writes to the vault; produces confirm-screen candidates.
 */

export interface CardIndex {
  cards: Card[];
  byNormName: Map<string, Card[]>;
  byId: Map<string, Card>;
}

export function buildCardIndex(cards: Card[]): CardIndex {
  const byNormName = new Map<string, Card[]>();
  const byId = new Map<string, Card>();
  for (const card of cards) {
    const key = normalizeName(card.name);
    const list = byNormName.get(key);
    if (list) list.push(card);
    else byNormName.set(key, [card]);
    byId.set(card.id, card);
  }
  return { cards, byNormName, byId };
}

/** Stable "base printing" pick: earliest set, lowest collector number. */
function basePrinting(printings: Card[]): { pick: Card; rest: Card[] } {
  const sorted = [...printings].sort(
    (a, b) =>
      a.set_code.localeCompare(b.set_code) || a.collector_number - b.collector_number,
  );
  return { pick: sorted[0]!, rest: sorted.slice(1) };
}

const HIGH_SIM = 0.75;
const HIGH_GAP = 0.08;
const LOW_SIM = 0.45;
// A legible set+number is near-deterministic on its own; the name-similarity
// guard only exists to catch misread numbers pointing at unrelated cards.
// Trigram Dice drops fast on short names, so keep this permissive.
const NUMBER_RESCUE_SIM = 0.35;

export function resolveExtraction(x: ScanExtraction, index: CardIndex): Candidate {
  const count = Math.max(1, Math.round(x.count || 1));
  const norm = normalizeName(x.name || '');
  const raw = `${x.name}${x.set_code ? ` (${x.set_code}${x.collector_number ? `-${x.collector_number}` : ''})` : ''}`;
  const modelLow = x.confidence === 'low';

  const numberHit =
    x.set_code && x.collector_number
      ? index.byId.get(makeCardId(x.set_code, x.collector_number)) ?? null
      : null;

  // 1. Exact (normalised) name match.
  const exact = norm ? index.byNormName.get(norm) : undefined;
  if (exact && exact.length > 0) {
    // Disambiguate printings with the extracted collector number when legible.
    if (numberHit && exact.some((c) => c.id === numberHit.id)) {
      return {
        card: numberHit,
        count,
        confidence: modelLow ? 'low' : 'high',
        alternatives: exact.filter((c) => c.id !== numberHit.id),
        raw,
      };
    }
    const { pick, rest } = basePrinting(exact);
    return {
      card: pick,
      count,
      confidence: modelLow ? 'low' : 'high',
      alternatives: rest,
      flag: rest.length > 0 ? 'multiple printings — defaulted to base' : undefined,
      raw,
    };
  }

  // 2. Collector-number rescue: the number resolves to a card whose name is
  //    at least similar to what was read (tiny corner print beats bad OCR).
  if (numberHit && norm && similarity(norm, normalizeName(numberHit.name)) >= NUMBER_RESCUE_SIM) {
    return {
      card: numberHit,
      count,
      confidence: modelLow ? 'low' : 'high',
      flag: 'matched via collector number',
      raw,
    };
  }

  // 3. Trigram fuzzy match over all card names.
  if (norm) {
    const scored = index.cards
      .map((card) => ({ card, sim: similarity(norm, normalizeName(card.name)) }))
      .sort((a, b) => b.sim - a.sim);
    const best = scored[0];
    const second = scored[1];
    if (best && best.sim >= HIGH_SIM && (!second || best.sim - second.sim >= HIGH_GAP || normalizeName(second.card.name) === normalizeName(best.card.name))) {
      return {
        card: best.card,
        count,
        confidence: modelLow ? 'low' : 'high',
        flag: 'fuzzy name match',
        alternatives: scored.slice(1, 3).filter((s) => s.sim >= LOW_SIM).map((s) => s.card),
        raw,
      };
    }
    if (best && best.sim >= LOW_SIM) {
      return {
        card: best.card,
        count,
        confidence: 'low',
        flag: 'uncertain match — check before adding',
        alternatives: scored.slice(1, 3).filter((s) => s.sim >= 0.3).map((s) => s.card),
        raw,
      };
    }
    // No decent match: surface top FTS-ish candidates for manual pick.
    return {
      card: null,
      count,
      confidence: 'low',
      flag: 'no match — pick manually',
      alternatives: scored.slice(0, 3).filter((s) => s.sim >= 0.25).map((s) => s.card),
      raw,
    };
  }

  return { card: null, count, confidence: 'low', flag: 'unreadable name', raw };
}

export function resolveExtractions(xs: ScanExtraction[], index: CardIndex): Candidate[] {
  // Merge duplicate extractions of the same card (quadrant overlap etc.)
  const out: Candidate[] = [];
  const seen = new Map<string, Candidate>();
  for (const x of xs) {
    const cand = resolveExtraction(x, index);
    const key = cand.card?.id;
    if (key && seen.has(key)) {
      seen.get(key)!.count += cand.count;
    } else {
      if (key) seen.set(key, cand);
      out.push(cand);
    }
  }
  return out;
}
