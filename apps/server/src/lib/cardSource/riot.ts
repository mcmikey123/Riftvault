import type { CardSource, SourceCard } from './index.js';

/**
 * Fallback source: Riot's official card gallery exposes fetchable JSON — see
 * github.com/vikkumar2021/RiftboundCardDatabase for the endpoint pattern.
 * Deliberately unimplemented until it's actually needed (and the endpoint
 * verified); this stub exists so the swap is a one-file change behind the
 * CardSource interface.
 */
export class RiotGallerySource implements CardSource {
  name = 'riot';

  async fetchAllCards(): Promise<SourceCard[]> {
    throw new Error(
      'RiotGallerySource is not implemented yet. Find the gallery JSON endpoint ' +
        '(see github.com/vikkumar2021/RiftboundCardDatabase), implement fetchAllCards() ' +
        'in apps/server/src/lib/cardSource/riot.ts, then run CARD_SOURCE=riot npm run sync-cards.',
    );
  }
}
