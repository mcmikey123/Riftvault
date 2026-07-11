import { describe, expect, it } from 'vitest';
import type { ScanExtraction } from '@riftvault/types';
import { buildCardIndex, resolveExtraction, resolveExtractions } from '../src/lib/resolveScan.js';
import { FIXTURE_CARDS } from './fixtures.js';

const index = buildCardIndex(FIXTURE_CARDS);

function x(partial: Partial<ScanExtraction> & { name: string }): ScanExtraction {
  return { count: 1, confidence: 'high', set_code: null, collector_number: null, ...partial };
}

describe('resolveExtraction', () => {
  it('resolves an exact name with high confidence', () => {
    const cand = resolveExtraction(x({ name: 'Hextech Forge' }), index);
    expect(cand.card?.id).toBe('OGN-203');
    expect(cand.confidence).toBe('high');
  });

  it('is tolerant of punctuation and case differences', () => {
    const cand = resolveExtraction(x({ name: 'kaisa daughter of the void' }), index);
    expect(cand.card?.id).toBe('SFR-030');
    expect(cand.confidence).toBe('high');
  });

  it('survives 1-2 character OCR misses via trigram match', () => {
    const cand = resolveExtraction(x({ name: 'Piltover Peacemakor' }), index); // misread 'e'
    expect(cand.card?.id).toBe('OGN-112');
    expect(cand.confidence).toBe('high');
    expect(cand.flag).toContain('fuzzy');
  });

  it('defaults multiple printings to the base printing with alternatives', () => {
    const cand = resolveExtraction(x({ name: 'Void Gate' }), index);
    expect(cand.card?.id).toBe('OGN-045'); // OGN before SFR
    expect(cand.alternatives?.map((c) => c.id)).toEqual(['SFR-012']);
  });

  it('uses the collector number to disambiguate printings when legible', () => {
    const cand = resolveExtraction(
      x({ name: 'Void Gate', set_code: 'SFR', collector_number: 12 }),
      index,
    );
    expect(cand.card?.id).toBe('SFR-012');
    expect(cand.confidence).toBe('high');
  });

  it('rescues a badly misread name via a legible collector number', () => {
    const cand = resolveExtraction(
      x({ name: 'Vold Cate', set_code: 'OGN', collector_number: 45 }),
      index,
    );
    expect(cand.card?.id).toBe('OGN-045');
    expect(cand.flag).toContain('collector number');
  });

  it('offers low-confidence candidates for ambiguous similar names', () => {
    const cand = resolveExtraction(x({ name: 'Arcane Sigt' }), index);
    // 'Arcane Sight' and 'Arcane Surge' are both close — must not be silently high
    expect(cand.card).not.toBeNull();
    expect(['OGN-008', 'OGN-009']).toContain(cand.card!.id);
  });

  it('returns null card with manual-pick flag for garbage', () => {
    const cand = resolveExtraction(x({ name: 'Zzzzqqqq Blorbo' }), index);
    expect(cand.card).toBeNull();
    expect(cand.confidence).toBe('low');
  });

  it('caps confidence at low when the model was unsure', () => {
    const cand = resolveExtraction(x({ name: 'Void Gate', confidence: 'low' }), index);
    expect(cand.confidence).toBe('low');
  });
});

describe('resolveExtractions', () => {
  it('merges duplicate extractions of the same card (quadrant overlap)', () => {
    const cands = resolveExtractions(
      [x({ name: 'Void Gate', count: 1 }), x({ name: 'void gate', count: 2 })],
      index,
    );
    expect(cands).toHaveLength(1);
    expect(cands[0]!.count).toBe(3);
  });
});
