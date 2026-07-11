/**
 * CardSource abstraction — the card DB is synced, never typed. RiftScribe is
 * the primary source; swap via CARD_SOURCE env if it dies or changes shape.
 */

export interface SourceCard {
  id: string;
  set_code: string;
  collector_number: number;
  name: string;
  type: string | null;
  faction: string | null;
  rarity: string | null;
  image_url: string | null;
  raw_json: string;
}

export interface SourceSet {
  code: string;
  name: string;
}

export interface CardSource {
  name: string;
  fetchAllCards(): Promise<SourceCard[]>;
  /** Optional: set code → display name ("OGN" → "Origins"). */
  fetchSets?(): Promise<SourceSet[]>;
}

export { RiftScribeSource } from './riftscribe.js';
export { RiotGallerySource } from './riot.js';

export async function getCardSource(kind: string, base?: string): Promise<CardSource> {
  const { RiftScribeSource } = await import('./riftscribe.js');
  const { RiotGallerySource } = await import('./riot.js');
  switch (kind) {
    case 'riftscribe':
      return new RiftScribeSource(base);
    case 'riot':
      return new RiotGallerySource();
    default:
      throw new Error(`unknown CARD_SOURCE '${kind}' (expected riftscribe|riot)`);
  }
}
