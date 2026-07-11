/** Card ID helpers. Canonical stored ID is `SET-NNN` (zero-padded to 3), e.g. 'OGN-045'. */

export interface CardRef {
  set_code: string;
  collector_number: number;
}

/**
 * Parse any accepted ID form into a card ref:
 * 'OGN-001-298' (full, with set size suffix), 'OGN-1', 'OGN-001', 'ogn 45'.
 * Returns null when the string is not an ID.
 */
export function parseCardRef(input: string): CardRef | null {
  const m = input
    .trim()
    .match(/^([A-Za-z]{2,5})[-\s]0*(\d{1,4})(?:[-/]\d{1,4})?$/);
  if (!m) return null;
  const set_code = m[1]!.toUpperCase();
  const collector_number = parseInt(m[2]!, 10);
  if (!Number.isFinite(collector_number) || collector_number <= 0) return null;
  return { set_code, collector_number };
}

export function makeCardId(set_code: string, collector_number: number): string {
  return `${set_code.toUpperCase()}-${String(collector_number).padStart(3, '0')}`;
}
