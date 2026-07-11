import { describe, expect, it } from 'vitest';
import { parseSetsPayload } from '../src/lib/cardSource/riftscribe.js';

describe('parseSetsPayload', () => {
  it('parses {sets: [{id, name}]}', () => {
    expect(
      parseSetsPayload({ sets: [{ id: 'OGN', name: 'Origins' }, { id: 'SFD', name: 'Spiritforged' }] }),
    ).toEqual([
      { code: 'OGN', name: 'Origins' },
      { code: 'SFD', name: 'Spiritforged' },
    ]);
  });

  it('parses nested {filters: {sets: [...]}} with label fields', () => {
    expect(
      parseSetsPayload({ filters: { sets: [{ value: 'ogn', label: 'Origins' }] } }),
    ).toEqual([{ code: 'OGN', name: 'Origins' }]);
  });

  it('falls back to codes for bare string lists', () => {
    expect(parseSetsPayload({ sets: ['OGN', 'OGS'] })).toEqual([
      { code: 'OGN', name: 'OGN' },
      { code: 'OGS', name: 'OGS' },
    ]);
  });

  it('returns empty for unrecognisable payloads', () => {
    expect(parseSetsPayload(null)).toEqual([]);
    expect(parseSetsPayload({ factions: ['fury'] })).toEqual([]);
    expect(parseSetsPayload('nope')).toEqual([]);
  });
});
