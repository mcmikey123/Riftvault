import { describe, expect, it } from 'vitest';
import { extractDeckFromNextHtml, PiltoverArchiveSource } from '../src/lib/deckImport.js';

const DECK_ID = '99f9a2a9-b0fd-4399-bdfd-4327a030c6e3';
const CARD_A = '457fc09c-6ab1-4c45-89a5-3b617eb62a59';
const CARD_B = '1f7859e2-b286-4a09-a0f6-b01cb5fecf91';
const VAR_A = 'c1222921-94f7-4e37-836a-92a7f2a23ec7';
const VAR_B = 'f98c1679-c215-4c94-99a2-3c3a14c22083';

// Mirrors the real page: RSC flight payload with escaped quotes, deck
// entries in sections, variant objects carrying variantNumber, card
// objects carrying names — plus a repeated payload chunk (hydration).
function flightHtml(): string {
  const entryA = `{\\"deckId\\":\\"${DECK_ID}\\",\\"cardId\\":\\"${CARD_A}\\",\\"variantId\\":\\"${VAR_A}\\",\\"quantity\\":5}`;
  const entryB = `{\\"deckId\\":\\"${DECK_ID}\\",\\"cardId\\":\\"${CARD_B}\\",\\"variantId\\":\\"${VAR_B}\\",\\"quantity\\":1}`;
  const variantA = `{\\"id\\":\\"${VAR_A}\\",\\"cardId\\":\\"${CARD_A}\\",\\"setId\\":\\"\\",\\"variantNumber\\":\\"OGN-042\\",\\"imageUrl\\":\\"https://cdn.example/OGN-042.webp\\"}`;
  const variantB = `{\\"id\\":\\"${VAR_B}\\",\\"cardId\\":\\"${CARD_B}\\",\\"setId\\":\\"\\",\\"variantNumber\\":\\"OGN-251\\",\\"imageUrl\\":\\"x\\"}`;
  const cardA = `{\\"id\\":\\"${CARD_A}\\",\\"name\\":\\"Test Unit\\",\\"rarity\\":\\"rare\\"}`;
  const cardB = `{\\"id\\":\\"${CARD_B}\\",\\"name\\":\\"Jinx - Loose Cannon\\",\\"rarity\\":\\"epic\\"}`;
  const deck = `{\\"id\\":\\"${DECK_ID}\\",\\"userId\\":\\"u\\",\\"name\\":\\"Calm Jinx Aggro\\"}`;
  const payload = `\\"deck\\":${deck},\\"champions\\":[${entryB}],\\"mainboard\\":[${entryA}],\\"variants\\":[${variantA},${variantB}],\\"cards\\":[${cardA},${cardB}]`;
  return `<!DOCTYPE html><html><head><title>Calm Jinx Aggro | Piltover Archive</title></head><body>
<script>self.__next_f.push([1,"${payload}"])</script>
<script>self.__next_f.push([1,"${payload}"])</script>
</body></html>`;
}

describe('extractDeckFromNextHtml', () => {
  it('joins entries → variants → names and dedupes repeated payloads', () => {
    const result = extractDeckFromNextHtml(flightHtml(), DECK_ID)!;
    expect(result).not.toBeNull();
    expect(result.name).toBe('Calm Jinx Aggro');
    expect(result.text.split('\n').sort()).toEqual([
      '1 Jinx - Loose Cannon (OGN-251)',
      '5 Test Unit (OGN-042)',
    ]);
  });

  it('falls back to the page title when the deck object is absent', () => {
    const html = flightHtml().replace(new RegExp(`"id\\\\":\\\\"${DECK_ID}`, 'g'), '"idx\\":\\"x');
    const result = extractDeckFromNextHtml(html, DECK_ID)!;
    expect(result.name).toBe('Calm Jinx Aggro');
  });

  it('returns null on pages without flight deck data', () => {
    expect(extractDeckFromNextHtml('<html><body>hello</body></html>', DECK_ID)).toBeNull();
  });
});

describe('PiltoverArchiveSource', () => {
  it('claims piltoverarchive.com URLs', () => {
    const source = new PiltoverArchiveSource();
    expect(source.matches(`https://piltoverarchive.com/decks/view/${DECK_ID}`)).toBe(true);
    expect(source.matches('https://example.com/decks/view/x')).toBe(false);
  });
});
