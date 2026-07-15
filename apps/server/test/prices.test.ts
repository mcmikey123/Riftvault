import { describe, expect, it } from 'vitest';
import { RawJsonPriceSource, extractPriceFromRaw, syncPrices } from '../src/lib/prices.js';
import { seedDb } from './fixtures.js';

describe('extractPriceFromRaw', () => {
  it('reads a flat price field', () => {
    expect(extractPriceFromRaw({ name: 'X', price: 1.25 })).toEqual({
      price: 1.25,
      price_foil: null,
      currency: 'USD',
    });
  });

  it('reads nested prices with foil and prefers the shortest path', () => {
    const raw = {
      prices: { usd: '0.50', usd_foil: '2.10', median_30d: 0.6 },
    };
    expect(extractPriceFromRaw(raw)).toEqual({
      price: 0.5,
      price_foil: 2.1,
      currency: 'USD',
    });
  });

  it('detects EUR from cardmarket-ish paths', () => {
    expect(extractPriceFromRaw({ prices: { eur: 0.4 } })).toMatchObject({
      price: 0.4,
      currency: 'EUR',
    });
  });

  it('reads market_price style fields', () => {
    expect(extractPriceFromRaw({ market_price: 3 })).toMatchObject({ price: 3 });
  });

  it('returns null when nothing price-ish exists', () => {
    expect(
      extractPriceFromRaw({ name: 'X', stats: { energy: 5, might: 5 }, rarity: 'rare' }),
    ).toBeNull();
    expect(extractPriceFromRaw(null)).toBeNull();
  });

  it('ignores absurd or negative values', () => {
    expect(extractPriceFromRaw({ price: -2 })).toBeNull();
    expect(extractPriceFromRaw({ price: 5000000 })).toBeNull();
  });
});

describe('syncPrices', () => {
  it('upserts extracted prices and reports coverage', async () => {
    const db = seedDb();
    db.prepare("UPDATE cards SET raw_json = '{\"price\": 1.5}' WHERE id = 'OGN-045'").run();
    const result = await syncPrices(db, new RawJsonPriceSource());
    expect(result.priced).toBe(1);
    const row = db.prepare("SELECT * FROM card_prices WHERE card_id = 'OGN-045'").get() as {
      price: number;
      currency: string;
      source: string;
    };
    expect(row).toMatchObject({ price: 1.5, currency: 'USD', source: 'riftscribe-raw' });
  });

  it('reports payload fields when nothing is priced', async () => {
    const db = seedDb();
    db.prepare("UPDATE cards SET raw_json = '{\"name\":\"X\",\"rarity\":\"rare\"}'").run();
    const result = await syncPrices(db, new RawJsonPriceSource());
    expect(result.priced).toBe(0);
    expect(result.sample_fields).toContain('name');
  });
});
