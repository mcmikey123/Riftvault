import { describe, expect, it } from 'vitest';
import { parseScanJson } from '../src/lib/scan.js';

describe('parseScanJson', () => {
  it('parses a clean JSON array', () => {
    const out = parseScanJson(
      '[{"name": "Void Gate", "set_code": "OGN", "collector_number": 45, "count": 1, "confidence": "high"}]',
    );
    expect(out).toEqual([
      { name: 'Void Gate', set_code: 'OGN', collector_number: 45, count: 1, confidence: 'high' },
    ]);
  });

  it('strips markdown fences', () => {
    const out = parseScanJson('```json\n[{"name": "Void Gate", "count": 2, "confidence": "low"}]\n```');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: 'Void Gate', count: 2, confidence: 'low', set_code: null });
  });

  it('tolerates prose around the array', () => {
    const out = parseScanJson('Here are the cards:\n[{"name": "Jinx", "count": 1}]\nDone!');
    expect(out).toHaveLength(1);
  });

  it('coerces string numbers and drops nameless entries', () => {
    const out = parseScanJson(
      '[{"name": "A", "collector_number": "045", "count": "2"}, {"count": 3}, {"name": ""}]',
    );
    expect(out).toEqual([
      { name: 'A', set_code: null, collector_number: 45, count: 2, confidence: 'high' },
    ]);
  });

  it('rejects bogus set codes and clamps silly counts', () => {
    const out = parseScanJson('[{"name": "A", "set_code": "NOT A SET", "count": 999}]');
    expect(out[0]).toMatchObject({ set_code: null, count: 20 });
  });

  it('returns empty on garbage', () => {
    expect(parseScanJson('sorry, I cannot read this image')).toEqual([]);
    expect(parseScanJson('{"name": "not an array"}')).toEqual([]);
    expect(parseScanJson('')).toEqual([]);
  });
});
