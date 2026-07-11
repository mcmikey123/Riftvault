/**
 * Set-scoped rapid number entry. Input like:
 *   "45x3 67 112 203x2"  (also "45*3", "45,67", newlines)
 * Pure function: parses to {collector_number, count} pairs; duplicate
 * numbers are merged by summing counts; unparseable tokens are returned
 * for inline flagging.
 */

export interface RapidEntry {
  collector_number: number;
  count: number;
}

export interface RapidParseResult {
  entries: RapidEntry[];
  invalid: string[];
}

export function parseRapidEntry(input: string): RapidParseResult {
  const counts = new Map<number, number>();
  const order: number[] = [];
  const invalid: string[] = [];

  for (const token of input.split(/[\s,;]+/)) {
    if (!token) continue;
    const m = token.match(/^0*(\d{1,4})(?:\s*[x*]\s*(\d{1,3}))?$/i);
    if (!m) {
      invalid.push(token);
      continue;
    }
    const num = parseInt(m[1]!, 10);
    const count = m[2] ? parseInt(m[2], 10) : 1;
    if (num <= 0 || count <= 0) {
      invalid.push(token);
      continue;
    }
    if (!counts.has(num)) order.push(num);
    counts.set(num, (counts.get(num) ?? 0) + count);
  }

  return {
    entries: order.map((n) => ({ collector_number: n, count: counts.get(n)! })),
    invalid,
  };
}
