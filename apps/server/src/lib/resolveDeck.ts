import type { Card } from '@riftvault/types';
import type { Db } from '../db.js';
import { makeCardId } from './cardId.js';
import { normalizeName } from './normalize.js';
import type { DecklistEntry } from './parseDecklist.js';
import { allCards, getCard, searchCards } from './search.js';
import { similarity } from './trigram.js';

/**
 * Resolve parsed decklist entries against the local card table:
 * exact (normalised) name match → FTS fallback → trigram rescue →
 * unresolved lines returned for manual fixing in the UI.
 */

export interface ResolvedDeck {
  cards: Map<string, { card: Card; qty: number }>;
  unresolved: string[];
}

const TRIGRAM_RESCUE = 0.82;

export function resolveDeckEntries(db: Db, entries: DecklistEntry[]): ResolvedDeck {
  const cards = new Map<string, { card: Card; qty: number }>();
  const unresolved: string[] = [];
  let norms: { card: Card; norm: string }[] | null = null;
  const byNorm = new Map<string, Card[]>();

  const ensureIndex = () => {
    if (norms) return;
    norms = allCards(db).map((card) => ({ card, norm: normalizeName(card.name) }));
    for (const { card, norm } of norms) {
      const list = byNorm.get(norm);
      if (list) list.push(card);
      else byNorm.set(norm, [card]);
    }
  };

  const add = (card: Card, qty: number) => {
    const existing = cards.get(card.id);
    if (existing) existing.qty += qty;
    else cards.set(card.id, { card, qty });
  };

  for (const entry of entries) {
    if (entry.ref) {
      const card = getCard(db, makeCardId(entry.ref.set_code, entry.ref.collector_number));
      if (card) {
        add(card, entry.qty);
        continue;
      }
      // Ref not in the local DB — fall through to name resolution when the
      // line carried a name too ("Card Name (OGN-045)" exports).
      if (!entry.name) {
        unresolved.push(entry.raw);
        continue;
      }
    }

    const name = entry.name ?? '';
    ensureIndex();
    const norm = normalizeName(name);

    // 1. Exact normalised name → base printing.
    const exact = byNorm.get(norm);
    if (exact && exact.length > 0) {
      const base = [...exact].sort(
        (a, b) => a.set_code.localeCompare(b.set_code) || a.collector_number - b.collector_number,
      )[0]!;
      add(base, entry.qty);
      continue;
    }

    // 2. FTS: a single hit is trustworthy.
    const fts = searchCards(db, name, undefined, 5);
    const distinctNames = new Set(fts.map((c) => normalizeName(c.name)));
    if (fts.length > 0 && distinctNames.size === 1) {
      add(fts[0]!, entry.qty);
      continue;
    }

    // 3. Trigram rescue for typos FTS can't prefix-match.
    const scored = norms!
      .map(({ card, norm: cardNorm }) => ({ card, sim: similarity(norm, cardNorm) }))
      .sort((a, b) => b.sim - a.sim);
    if (scored[0] && scored[0].sim >= TRIGRAM_RESCUE) {
      add(scored[0].card, entry.qty);
      continue;
    }

    unresolved.push(entry.raw);
  }

  return { cards, unresolved };
}
