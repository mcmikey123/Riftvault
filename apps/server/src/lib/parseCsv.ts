/**
 * CSV import: `set,number,qty[,qty_foil]` rows, optional header row.
 * Pure function; resolution against the card DB happens separately.
 */

export interface CsvRow {
  set_code: string;
  collector_number: number;
  qty: number;
  qty_foil: number;
}

export interface CsvParseResult {
  rows: CsvRow[];
  invalid: { line: string; reason: string }[];
}

export function parseVaultCsv(text: string): CsvParseResult {
  const rows: CsvRow[] = [];
  const invalid: { line: string; reason: string }[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 3) {
      invalid.push({ line, reason: 'expected set,number,qty[,qty_foil]' });
      continue;
    }
    const [set, num, qty, qtyFoil] = cols;
    const collector_number = parseInt(num!, 10);
    const q = parseInt(qty!, 10);
    const qf = qtyFoil ? parseInt(qtyFoil, 10) : 0;
    if (!set || !/^[A-Za-z]{2,5}$/.test(set)) {
      // Tolerate a header row anywhere numbers don't parse
      if (i === 0 && (Number.isNaN(collector_number) || Number.isNaN(q))) continue;
      invalid.push({ line, reason: `bad set code '${set}'` });
      continue;
    }
    if (Number.isNaN(collector_number) || Number.isNaN(q)) {
      if (i === 0) continue; // header row
      invalid.push({ line, reason: 'number and qty must be integers' });
      continue;
    }
    if (collector_number <= 0 || q < 0 || (Number.isNaN(qf) ? true : qf < 0)) {
      invalid.push({ line, reason: 'values out of range' });
      continue;
    }
    rows.push({
      set_code: set.toUpperCase(),
      collector_number,
      qty: q,
      qty_foil: Number.isNaN(qf) ? 0 : qf,
    });
  }

  return { rows, invalid };
}
