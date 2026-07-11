/**
 * DeckImportSource — deck-by-URL import behind an interface so the Piltover
 * Archive page structure can change without touching the deck routes.
 */

export interface DeckImportResult {
  name: string | null;
  archetype: string | null;
  /** Decklist text in a format parseDecklist() understands. */
  text: string;
}

export interface DeckImportSource {
  /** Whether this source claims the given URL. */
  matches(url: string): boolean;
  fetchDeck(url: string): Promise<DeckImportResult>;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * Piltover Archive (piltoverarchive.com) is a Next.js app that server-renders
 * deck pages with the full deck data embedded as escaped JSON in the RSC
 * flight payload. Verified against a live deck page on 2026-07-11:
 *   - deck entries:    {"deckId":…,"cardId":"<uuid>","variantId":"<uuid>","quantity":N}
 *   - variant objects: {"id":"<variant uuid>",…,"variantNumber":"OGN-042",…}
 *   - card objects:    {"id":"<card uuid>",…,"name":"Card Name",…}
 * We join the three by UUID and emit decklist lines the normal parser reads.
 */
export class PiltoverArchiveSource implements DeckImportSource {
  matches(url: string): boolean {
    try {
      const host = new URL(url).hostname;
      return /piltoverarchive/i.test(host);
    } catch {
      return false;
    }
  }

  async fetchDeck(url: string): Promise<DeckImportResult> {
    const res = await fetch(url, { headers: { accept: 'text/html' } });
    if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
    const html = await res.text();

    const deckId = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    const extracted = extractDeckFromNextHtml(html, deckId);
    if (extracted) return extracted;

    // Fallbacks: an embedded export block, else a clear error.
    const pre =
      html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i) ??
      html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/i);
    if (pre && pre[1] && /\d\s*x?\s*\w/.test(pre[1])) {
      return { name: titleOf(html), archetype: null, text: decodeEntities(pre[1]) };
    }
    throw new Error(
      'Could not extract a decklist from that URL — the page structure may have ' +
        'changed. Paste the deck export text instead (and see deckImport.ts).',
    );
  }
}

/**
 * Pure extraction from the fetched HTML — exported for unit tests.
 * Returns null when the flight-payload structures aren't found.
 */
export function extractDeckFromNextHtml(
  html: string,
  deckId: string,
): DeckImportResult | null {
  // Flight payloads escape quotes (\" in the raw HTML); normalise once.
  const clean = html.replace(/\\"/g, '"');

  // variantId → collector code ("OGN-042"), from variant objects.
  const variantToNumber = new Map<string, string>();
  for (const m of clean.matchAll(
    new RegExp(`"id":"(${UUID})"[^{}\\[\\]]{0,500}?"variantNumber":"([A-Za-z]{2,5}-[A-Za-z0-9]{1,6})"`, 'g'),
  )) {
    if (!variantToNumber.has(m[1]!)) variantToNumber.set(m[1]!, m[2]!);
  }

  // cardId → name, from card objects (tolerant: any object pairing a uuid id
  // with a name; only consulted for uuids referenced by deck entries).
  const uuidToName = new Map<string, string>();
  for (const m of clean.matchAll(
    new RegExp(`"id":"(${UUID})"[^{}\\[\\]]{0,300}?"name":"([^"]{1,120})"`, 'g'),
  )) {
    if (!uuidToName.has(m[1]!)) uuidToName.set(m[1]!, m[2]!);
  }

  // Deck entries. The RSC payload can repeat; dedupe by variantId.
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const m of clean.matchAll(
    new RegExp(`"cardId":"(${UUID})","variantId":"(${UUID})","quantity":(\\d+)`, 'g'),
  )) {
    const [, cardId, variantId, qtyStr] = m;
    if (seen.has(variantId!)) continue;
    seen.add(variantId!);
    const qty = parseInt(qtyStr!, 10);
    if (qty <= 0) continue;
    const number = variantToNumber.get(variantId!);
    const name = uuidToName.get(cardId!);
    if (name && number) lines.push(`${qty} ${decodeEntities(name)} (${number})`);
    else if (number) lines.push(`${qty} ${number}`);
    else if (name) lines.push(`${qty} ${decodeEntities(name)}`);
  }
  if (lines.length === 0) return null;

  // Deck name: the deck object itself, else the page title.
  let name: string | null = null;
  if (deckId) {
    const dm = clean.match(
      new RegExp(`"id":"${deckId}"[^{}\\[\\]]{0,400}?"name":"([^"]{1,120})"`),
    );
    if (dm) name = decodeEntities(dm[1]!);
  }
  name ??= titleOf(html);

  return { name, archetype: null, text: lines.join('\n') };
}

function titleOf(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!m) return null;
  // "Deck Name | Piltover Archive" → "Deck Name"
  return decodeEntities(m[1]!.split(/\s*[|–—]\s*/)[0]!.trim()) || null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

const sources: DeckImportSource[] = [new PiltoverArchiveSource()];

export function findImportSource(url: string): DeckImportSource | null {
  return sources.find((s) => s.matches(url)) ?? null;
}

/**
 * Extract deck-page links from a PA listing page (deck library / meta page),
 * in page order, deduped. Pure — exported for unit tests.
 */
export function extractDeckLinks(html: string, origin: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of html.matchAll(new RegExp(`/decks/view/(${UUID})`, 'g'))) {
    const id = m[1]!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(`${origin.replace(/\/$/, '')}/decks/view/${id}`);
  }
  return out;
}
