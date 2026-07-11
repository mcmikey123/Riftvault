import { parseCardRef, type CardRef } from './cardId.js';

/**
 * Decklist parser. Pure function — resolution against the card DB happens
 * separately. Accepted line formats:
 *   "3 Card Name"
 *   "3x Card Name"
 *   "Card Name x3"
 *   "3 OGN-045"        (card by ID)
 *   "OGN-045"          (qty 1 by ID)
 *   "Card Name"        (qty 1 — legend/champion lines in common exports)
 * Skipped: blank lines, comments (# or //), section headers ("Main Deck:",
 * "Battlefields (3)", known section words).
 */

export interface DecklistEntry {
  qty: number;
  /** Card name as written, when the line referenced a name. */
  name?: string;
  /** Set/number reference, when the line referenced a card ID. */
  ref?: CardRef;
  raw: string;
}

export interface DecklistParseResult {
  entries: DecklistEntry[];
  /** Lines that could not be interpreted at all. */
  unparsed: string[];
}

const SECTION_WORDS = new Set([
  'deck',
  'main',
  'maindeck',
  'main deck',
  'sideboard',
  'side',
  'legend',
  'legends',
  'champion',
  'champions',
  'champion unit',
  'battlefield',
  'battlefields',
  'runes',
  'rune deck',
  'token',
  'tokens',
]);

function isSectionHeader(line: string): boolean {
  if (/:\s*$/.test(line)) return true;
  // "Main Deck (40)" / "Battlefields (3)"
  const noCount = line.replace(/\s*\(\d+\)\s*$/, '');
  return SECTION_WORDS.has(noCount.toLowerCase().trim());
}

export function parseDecklist(text: string): DecklistParseResult {
  const entries: DecklistEntry[] = [];
  const unparsed: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#') || line.startsWith('//')) continue;
    if (isSectionHeader(line)) continue;

    // "3 Card Name" | "3x Card Name" | "3 OGN-045"
    let m = line.match(/^(\d{1,2})\s*[xX]?\s+(.+)$/);
    if (m) {
      const qty = parseInt(m[1]!, 10);
      const rest = m[2]!.trim();
      const ref = parseCardRef(rest);
      if (qty > 0 && rest) {
        entries.push(ref ? { qty, ref, raw: line } : { qty, name: rest, raw: line });
        continue;
      }
    }

    // "Card Name x3" (space before the x required, so names ending in a
    // word like "Axiom" aren't mangled)
    m = line.match(/^(.+?)\s+[xX]\s*(\d{1,2})$/);
    if (m) {
      const qty = parseInt(m[2]!, 10);
      const rest = m[1]!.trim();
      const ref = parseCardRef(rest);
      if (qty > 0 && rest) {
        entries.push(ref ? { qty, ref, raw: line } : { qty, name: rest, raw: line });
        continue;
      }
    }

    // Bare card ID → qty 1
    const ref = parseCardRef(line);
    if (ref) {
      entries.push({ qty: 1, ref, raw: line });
      continue;
    }

    // Bare name → qty 1, as long as it looks like a name at all
    if (/[a-zA-Z]{2,}/.test(line)) {
      entries.push({ qty: 1, name: line, raw: line });
      continue;
    }

    unparsed.push(line);
  }

  return { entries, unparsed };
}
