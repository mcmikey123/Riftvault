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

/**
 * Piltover Archive deck pages. The community TTS importer parses these URLs
 * (resolving card data via the Riftseer API), so the pages are known to be
 * machine-readable — but the exact JSON shape wasn't verifiable when this
 * was written. Strategy: try likely JSON endpoints for the deck ID, fall
 * back to scraping <pre>/textarea-ish export blocks; if nothing parses, the
 * route returns a clear error telling you to paste the export text instead.
 */
export class PiltoverArchiveSource implements DeckImportSource {
  matches(url: string): boolean {
    try {
      const host = new URL(url).hostname;
      return /piltoverarchive|pltar/i.test(host);
    } catch {
      return false;
    }
  }

  async fetchDeck(url: string): Promise<DeckImportResult> {
    const parsed = new URL(url);
    const deckId = parsed.pathname.split('/').filter(Boolean).pop() ?? '';

    // 1. Likely JSON API endpoints.
    const apiCandidates = [
      `${parsed.origin}/api/decks/${deckId}`,
      `${parsed.origin}/api/deck/${deckId}`,
      `${parsed.origin}/decks/${deckId}.json`,
    ];
    for (const api of apiCandidates) {
      try {
        const res = await fetch(api, { headers: { accept: 'application/json' } });
        if (!res.ok) continue;
        const body = (await res.json()) as Record<string, unknown>;
        const text = deckJsonToText(body);
        if (text) {
          return {
            name: typeof body.name === 'string' ? body.name : null,
            archetype:
              typeof body.archetype === 'string'
                ? body.archetype
                : typeof body.legend === 'string'
                  ? body.legend
                  : null,
            text,
          };
        }
      } catch {
        // try next candidate
      }
    }

    // 2. Fetch the page and look for an embedded export block.
    const res = await fetch(url, { headers: { accept: 'text/html' } });
    if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
    const html = await res.text();

    const pre = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i) ??
      html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/i);
    if (pre && pre[1] && /\d\s*x?\s*\w/.test(pre[1])) {
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      return {
        name: title ? decodeEntities(title[1]!.trim()) : null,
        archetype: null,
        text: decodeEntities(pre[1]),
      };
    }

    throw new Error(
      'Could not extract a decklist from that URL — the page structure may have ' +
        'changed. Paste the deck export text instead (and see deckImport.ts).',
    );
  }
}

/** Convert a plausible deck JSON payload into decklist text lines. */
function deckJsonToText(body: Record<string, unknown>): string | null {
  const listKeys = ['cards', 'deck_cards', 'deckCards', 'main', 'maindeck', 'list'];
  for (const key of listKeys) {
    const list = body[key];
    if (!Array.isArray(list) || list.length === 0) continue;
    const lines: string[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const qty = Number(o.qty ?? o.quantity ?? o.count ?? 1);
      const cardObj = (o.card ?? null) as Record<string, unknown> | null;
      const id =
        typeof o.card_id === 'string'
          ? o.card_id
          : cardObj && typeof cardObj.id === 'string'
            ? cardObj.id
            : null;
      const name =
        typeof o.name === 'string'
          ? o.name
          : cardObj && typeof cardObj.name === 'string'
            ? cardObj.name
            : null;
      if (id) lines.push(`${qty} ${id}`);
      else if (name) lines.push(`${qty} ${name}`);
    }
    if (lines.length > 0) return lines.join('\n');
  }
  return null;
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
