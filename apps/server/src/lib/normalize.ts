/**
 * Normalise a card name for matching: lowercase, strip diacritics and
 * punctuation, collapse whitespace. "Kai'Sa, Daughter of the Void" and
 * 'kaisa daughter of the void' normalise identically.
 */
export function normalizeName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
