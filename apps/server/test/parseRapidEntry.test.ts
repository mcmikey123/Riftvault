import { describe, expect, it } from 'vitest';
import { parseRapidEntry } from '../src/lib/parseRapidEntry.js';

describe('parseRapidEntry', () => {
  it('parses the spec example', () => {
    const { entries, invalid } = parseRapidEntry('45x3 67 112 203x2');
    expect(invalid).toEqual([]);
    expect(entries).toEqual([
      { collector_number: 45, count: 3 },
      { collector_number: 67, count: 1 },
      { collector_number: 112, count: 1 },
      { collector_number: 203, count: 2 },
    ]);
  });

  it('accepts * separators, commas and newlines', () => {
    const { entries, invalid } = parseRapidEntry('45*3,67\n112x2;9');
    expect(invalid).toEqual([]);
    expect(entries).toEqual([
      { collector_number: 45, count: 3 },
      { collector_number: 67, count: 1 },
      { collector_number: 112, count: 2 },
      { collector_number: 9, count: 1 },
    ]);
  });

  it('merges duplicate numbers', () => {
    const { entries } = parseRapidEntry('45 45x2 45');
    expect(entries).toEqual([{ collector_number: 45, count: 4 }]);
  });

  it('handles leading zeros and uppercase X', () => {
    const { entries } = parseRapidEntry('045X2 007');
    expect(entries).toEqual([
      { collector_number: 45, count: 2 },
      { collector_number: 7, count: 1 },
    ]);
  });

  it('flags junk tokens without dropping good ones', () => {
    const { entries, invalid } = parseRapidEntry('45 abc 67xx2 12x3');
    expect(entries).toEqual([
      { collector_number: 45, count: 1 },
      { collector_number: 12, count: 3 },
    ]);
    expect(invalid).toEqual(['abc', '67xx2']);
  });

  it('rejects zero counts and zero numbers', () => {
    const { entries, invalid } = parseRapidEntry('0 45x0');
    expect(entries).toEqual([]);
    expect(invalid).toEqual(['0', '45x0']);
  });

  it('handles empty input', () => {
    expect(parseRapidEntry('  \n ')).toEqual({ entries: [], invalid: [] });
  });
});
