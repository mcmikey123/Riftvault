import { describe, expect, it } from 'vitest';
import type { CardSource } from '../src/lib/cardSource/index.js';
import { syncSetNames } from '../src/lib/sync.js';
import { seedDb } from './fixtures.js';

function fakeSource(sets: { code: string; name: string }[]): CardSource {
  return {
    name: 'fake',
    fetchAllCards: () => Promise.resolve([]),
    fetchSets: () => Promise.resolve(sets),
  };
}

const getNames = (db: ReturnType<typeof seedDb>) =>
  Object.fromEntries(
    (db.prepare('SELECT code, name FROM sets').all() as { code: string; name: string }[]).map(
      (r) => [r.code, r.name],
    ),
  );

describe('syncSetNames', () => {
  it('treats code-as-name from the source as no name and uses the curated map', async () => {
    const db = seedDb(); // fixture cards live in OGN and SFR
    await syncSetNames(db, fakeSource([{ code: 'OGN', name: 'OGN' }]));
    const names = getNames(db);
    expect(names.OGN).toBe('Origins'); // curated
    expect(names.SFR).toBeUndefined(); // unknown → warned, left out
  });

  it('prefers a real name from the source over the curated map', async () => {
    const db = seedDb();
    await syncSetNames(db, fakeSource([{ code: 'OGN', name: 'Origins Deluxe' }]));
    expect(getNames(db).OGN).toBe('Origins Deluxe');
  });

  it('names sets found only in the cards table', async () => {
    const db = seedDb();
    await syncSetNames(db, fakeSource([]));
    expect(getNames(db).OGN).toBe('Origins');
  });
});
