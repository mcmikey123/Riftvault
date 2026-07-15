import { describe, expect, it } from 'vitest';
import type { PriceCardInfo } from '../src/lib/prices.js';
import {
  buildPriceIndex,
  matchGroupSet,
  matchProduct,
  productNumber,
} from '../src/lib/tcgcsv.js';

const CARDS: PriceCardInfo[] = [
  { id: 'OGN-045', name: 'Void Gate', set_code: 'OGN', collector_number: 45, raw_json: null },
  { id: 'OGN-067', name: 'Jinx, Loose Cannon', set_code: 'OGN', collector_number: 67, raw_json: null },
  { id: 'SFR-012', name: 'Void Gate', set_code: 'SFR', collector_number: 12, raw_json: null },
];
const index = buildPriceIndex(CARDS);
const SET_NAMES = new Map([
  ['OGN', 'Origins'],
  ['SFR', 'Spiritforged Reborn'],
]);

describe('matchGroupSet', () => {
  it('matches by abbreviation first', () => {
    expect(matchGroupSet({ groupId: 1, name: 'Whatever', abbreviation: 'ogn' }, index.setCodes, SET_NAMES)).toBe('OGN');
  });

  it('matches by display name', () => {
    expect(matchGroupSet({ groupId: 1, name: 'Origins' }, index.setCodes, SET_NAMES)).toBe('OGN');
  });

  it('matches by name prefix ("Origins Base Set")', () => {
    expect(matchGroupSet({ groupId: 1, name: 'Origins Base Set' }, index.setCodes, SET_NAMES)).toBe('OGN');
  });

  it('returns null for unknown groups', () => {
    expect(matchGroupSet({ groupId: 1, name: 'Promo Cards' }, index.setCodes, SET_NAMES)).toBeNull();
  });
});

describe('productNumber', () => {
  it('parses "045/298" style numbers', () => {
    expect(
      productNumber({ productId: 1, name: 'X', extendedData: [{ name: 'Number', value: '045/298' }] }),
    ).toEqual({ num: 45 });
  });

  it('parses full refs like OGN-045', () => {
    expect(
      productNumber({ productId: 1, name: 'X', extendedData: [{ name: 'Number', value: 'OGN-045' }] }),
    ).toEqual({ set_code: 'OGN', num: 45 });
  });

  it('returns null without a number field', () => {
    expect(productNumber({ productId: 1, name: 'Booster Box' })).toBeNull();
  });
});

describe('matchProduct', () => {
  it('matches by group set + number', () => {
    const product = {
      productId: 1,
      name: 'Void Gate (045/298)',
      extendedData: [{ name: 'Number', value: '045/298' }],
    };
    expect(matchProduct(product, 'OGN', index)).toBe('OGN-045');
  });

  it('falls back to name matching, preferring the group set', () => {
    const product = { productId: 1, name: 'Void Gate' };
    expect(matchProduct(product, 'SFR', index)).toBe('SFR-012');
    expect(matchProduct(product, null, index)).toBe('OGN-045'); // base printing
  });

  it('strips trailing parentheticals from names', () => {
    expect(matchProduct({ productId: 1, name: 'Jinx, Loose Cannon (067/298)' }, 'OGN', index)).toBe('OGN-067');
  });

  it('returns null for sealed products and unknowns', () => {
    expect(matchProduct({ productId: 1, name: 'Origins Booster Box' }, 'OGN', index)).toBeNull();
  });
});
