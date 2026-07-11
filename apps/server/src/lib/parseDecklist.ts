import { parseCardRef, type CardRef } from './cardId.js';

/**
 * Decklist parser. Pure function — resolution against the card DB happens
 * separately. Accepted line formats:
 *   "3 Card Name"
 *   "3x Card Name"
 *   "Card Name x3"
 *   "3 OGN-045"              (card by ID)
 *   "3 Card Name (OGN-045)"  (official/PA export — ID wins, name kept as fallback)
 *   "OGN-045"                (qty 1 by ID)
 *   "Card Name"              (qty 1 — legend/champion lines in common exports)
 * Skipped: blank lines, comments (# or //), section headers ("Main Deck:",
 * "Battlefields (3)", known section words).
 */

export interface DecklistEntry {
  qty: number;
  /** Card name as written, when the line referenced a name. */
  name?: string;
  /** Set/number reference; when both are present the ref is authoritative. */
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

/**
 * "Jinx - Loose Cannon (OGN-251)" → name + authoritative ref.
 * Parentheses that aren't a card ID stay part of the name.
 */
function entryFrom(qty: number, rest: string, raw: string): DecklistEntry {
  const wholeRef = parseCardRef(rest);
  if (wholeRef) return { qty, ref: wholeRef, raw };
  const m = rest.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (m) {
    const ref = parseCardRef(m[2]!);
    if (ref) {
      const name = m[1]!.trim();
      return name ? { qty, name, ref, raw } : { qty, ref, raw };
    }
  }
  return { qty, name: rest, raw };
}

export function parseDecklist(text: string): DecklistParseResult {
  const entries: DecklistEntry[] = [];
  const unparsed: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#') || line.startsWith('//')) continue;
    if (isSectionHeader(line)) continue;

    // "3 Card Name" | "3x Card Name" | "3 OGN-045" | "3 Card Name (OGN-045)"
    let m = line.match(/^(\d{1,2})\s*[xX]?\s+(.+)$/);
    if (m) {
      const qty = parseInt(m[1]!, 10);
      const rest = m[2]!.trim();
      if (qty > 0 && rest) {
        entries.push(entryFrom(qty, rest, line));
        continue;
      }
    }

    // "Card Name x3" (space before the x required, so names ending in a
    // word like "Axiom" aren't mangled)
    m = line.match(/^(.+?)\s+[xX]\s*(\d{1,2})$/);
    if (m) {
      const qty = parseInt(m[2]!, 10);
      const rest = m[1]!.trim();
      if (qty > 0 && rest) {
        entries.push(entryFrom(qty, rest, line));
        continue;
      }
    }

    // Bare ID, "Name (OGN-045)", or bare name → qty 1 (legend lines)
    if (parseCardRef(line) || /[a-zA-Z]{2,}/.test(line)) {
      entries.push(entryFrom(1, line, line));
      continue;
    }

    unparsed.push(line);
  }

  return { entries, unparsed };
}
