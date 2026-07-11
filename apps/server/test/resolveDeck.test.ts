import { describe, expect, it } from 'vitest';
import { parseDecklist } from '../src/lib/parseDecklist.js';
import { resolveDeckEntries } from '../src/lib/resolveDeck.js';
import { seedDb } from './fixtures.js';

describe('resolveDeckEntries', () => {
  it('resolves exact names, ids, fuzzy names; keeps unresolved lines', () => {
    const db = seedDb();
    const { entries } = parseDecklist(
      [
        '3 Void Gate', // exact name → base printing OGN-045
        '2 SFR-012', // explicit other printing by id
        "1 Kai'sa, daughter of the void", // case/punct-insensitive exact
        '2 Hextech Forgee', // typo → trigram rescue
        '4 Complete Nonsense Card',
      ].join('\n'),
    );
    const { cards, unresolved } = resolveDeckEntries(db, entries);

    expect(cards.get('OGN-045')?.qty).toBe(3);
    expect(cards.get('SFR-012')?.qty).toBe(2);
    expect(cards.get('SFR-030')?.qty).toBe(1);
    expect(cards.get('OGN-203')?.qty).toBe(2);
    expect(unresolved).toEqual(['4 Complete Nonsense Card']);
  });

  it('merges duplicate lines for the same card', () => {
    const db = seedDb();
    const { entries } = parseDecklist('2 Void Gate\n1 void gate');
    const { cards } = resolveDeckEntries(db, entries);
    expect(cards.get('OGN-045')?.qty).toBe(3);
  });
});
