import { describe, expect, it } from 'vitest';
import { mapCard } from '../src/lib/cardSource/riftscribe.js';

// Real payload shape, verified against the live API on 2026-07-11.
const REAL_CARD = {
  id: 'ogn-001-298',
  name: 'Blazing Scorcher',
  set_id: 'OGN',
  collector_number: 1,
  variant: '',
  rarity: 'common',
  faction: 'fury',
  type: 'Unit',
  orientation: 'portrait',
  stats: { energy: 5, might: 5, power: null },
  image: 'https://cdn.riftscribe.gg/cards/originals/ogn-001-298-x.png',
  image_thumb: {
    small: 'https://cdn.riftscribe.gg/cards/thumbnails/small/ogn-001-298-x.webp',
    medium: 'https://cdn.riftscribe.gg/cards/thumbnails/medium/ogn-001-298-x.webp',
  },
};

describe('riftscribe mapCard', () => {
  it('maps the verified live payload shape', () => {
    const card = mapCard(REAL_CARD)!;
    expect(card).toMatchObject({
      id: 'OGN-001',
      set_code: 'OGN',
      collector_number: 1,
      name: 'Blazing Scorcher',
      type: 'Unit',
      faction: 'fury',
      rarity: 'common',
      image_url: 'https://cdn.riftscribe.gg/cards/thumbnails/medium/ogn-001-298-x.webp',
    });
    expect(JSON.parse(card.raw_json)).toEqual(REAL_CARD);
  });

  it('derives set/number from the id when explicit fields are missing', () => {
    const card = mapCard({ id: 'ogn-045-298', name: 'X' })!;
    expect(card.id).toBe('OGN-045');
    expect(card.collector_number).toBe(45);
  });

  it('falls back to the original image without thumbnails', () => {
    const card = mapCard({ ...REAL_CARD, image_thumb: undefined })!;
    expect(card.image_url).toBe(REAL_CARD.image);
  });

  it('returns null for unmappable rows', () => {
    expect(mapCard({ name: 'No identity' })).toBeNull();
    expect(mapCard({ id: 'ogn-001-298' })).toBeNull(); // no name
  });
});
