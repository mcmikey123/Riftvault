import { describe, expect, it } from 'vitest';
import { parseVaultCsv } from '../src/lib/parseCsv.js';

describe('parseVaultCsv', () => {
  it('parses rows with and without foil column', () => {
    const { rows, invalid } = parseVaultCsv('OGN,45,3\nOGN,67,1,2');
    expect(invalid).toEqual([]);
    expect(rows).toEqual([
      { set_code: 'OGN', collector_number: 45, qty: 3, qty_foil: 0 },
      { set_code: 'OGN', collector_number: 67, qty: 1, qty_foil: 2 },
    ]);
  });

  it('skips a header row', () => {
    const { rows, invalid } = parseVaultCsv('set,number,qty,qty_foil\nogn,45,3');
    expect(invalid).toEqual([]);
    expect(rows).toEqual([{ set_code: 'OGN', collector_number: 45, qty: 3, qty_foil: 0 }]);
  });

  it('flags malformed rows with reasons', () => {
    const { rows, invalid } = parseVaultCsv('OGN,45,3\nOGN,x,3\nnope\nOGN,45,-1');
    expect(rows).toHaveLength(1);
    expect(invalid).toHaveLength(3);
  });

  it('handles quoted values and blank lines', () => {
    const { rows } = parseVaultCsv('\n"OGN",45,3\n\n');
    expect(rows).toEqual([{ set_code: 'OGN', collector_number: 45, qty: 3, qty_foil: 0 }]);
  });
});
