import { describe, expect, it } from 'vitest';
import { parseDecklist } from '../src/lib/parseDecklist.js';

describe('parseDecklist', () => {
  it('parses "3 Card Name"', () => {
    const { entries } = parseDecklist('3 Void Gate');
    expect(entries).toEqual([{ qty: 3, name: 'Void Gate', raw: '3 Void Gate' }]);
  });

  it('parses "3x Card Name"', () => {
    const { entries } = parseDecklist('3x Void Gate');
    expect(entries).toEqual([{ qty: 3, name: 'Void Gate', raw: '3x Void Gate' }]);
  });

  it('parses "Card Name x3"', () => {
    const { entries } = parseDecklist('Void Gate x3');
    expect(entries).toEqual([{ qty: 3, name: 'Void Gate', raw: 'Void Gate x3' }]);
  });

  it('parses "3 OGN-045" as a card ref', () => {
    const { entries } = parseDecklist('3 OGN-045');
    expect(entries).toEqual([
      { qty: 3, ref: { set_code: 'OGN', collector_number: 45 }, raw: '3 OGN-045' },
    ]);
  });

  it('parses full-form IDs with set-size suffix', () => {
    const { entries } = parseDecklist('2 OGN-001-298');
    expect(entries).toEqual([
      { qty: 2, ref: { set_code: 'OGN', collector_number: 1 }, raw: '2 OGN-001-298' },
    ]);
  });

  it('treats a bare name line as qty 1 (legend lines)', () => {
    const { entries } = parseDecklist('Jinx, Loose Cannon');
    expect(entries).toEqual([{ qty: 1, name: 'Jinx, Loose Cannon', raw: 'Jinx, Loose Cannon' }]);
  });

  it('skips comments, blanks and section headers', () => {
    const text = [
      '# my deck',
      '// scratch',
      '',
      'Main Deck (40)',
      'Battlefields:',
      'Sideboard',
      '3 Void Gate',
    ].join('\n');
    const { entries, unparsed } = parseDecklist(text);
    expect(entries).toEqual([{ qty: 3, name: 'Void Gate', raw: '3 Void Gate' }]);
    expect(unparsed).toEqual([]);
  });

  it('handles a messy realistic decklist', () => {
    const text = [
      'Legend:',
      'Jinx, Loose Cannon',
      '',
      'Main Deck (9)',
      '3x Void Gate',
      'Hextech Forge x2',
      '4 OGN-112',
      '???',
    ].join('\n');
    const { entries, unparsed } = parseDecklist(text);
    expect(entries).toHaveLength(4);
    expect(entries[0]).toMatchObject({ qty: 1, name: 'Jinx, Loose Cannon' });
    expect(entries[1]).toMatchObject({ qty: 3, name: 'Void Gate' });
    expect(entries[2]).toMatchObject({ qty: 2, name: 'Hextech Forge' });
    expect(entries[3]).toMatchObject({ qty: 4, ref: { set_code: 'OGN', collector_number: 112 } });
    expect(unparsed).toEqual(['???']);
  });

  it('parses "Name (SET-NNN)" exports with the ref authoritative and name kept', () => {
    const { entries } = parseDecklist('1 Jinx - Loose Cannon (OGN-251)\n6 Chaos Rune (OGN-166)');
    expect(entries).toEqual([
      {
        qty: 1,
        name: 'Jinx - Loose Cannon',
        ref: { set_code: 'OGN', collector_number: 251 },
        raw: '1 Jinx - Loose Cannon (OGN-251)',
      },
      {
        qty: 6,
        name: 'Chaos Rune',
        ref: { set_code: 'OGN', collector_number: 166 },
        raw: '6 Chaos Rune (OGN-166)',
      },
    ]);
  });

  it('keeps non-ref parentheses as part of the name', () => {
    const { entries } = parseDecklist('2 Fight or Flight (promo)');
    expect(entries).toEqual([
      { qty: 2, name: 'Fight or Flight (promo)', raw: '2 Fight or Flight (promo)' },
    ]);
  });

  it('does not mangle names ending in a word starting with x', () => {
    const { entries } = parseDecklist('2 Axiom Engine');
    expect(entries).toEqual([{ qty: 2, name: 'Axiom Engine', raw: '2 Axiom Engine' }]);
  });
});
