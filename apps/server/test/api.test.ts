import { describe, expect, it } from 'vitest';
import type { BulkResponse, DeckDiff, RecommendationsResponse } from '@riftvault/types';
import { createApp } from '../src/app.js';
import { OTHER_KEY, TEST_KEY, seedDb } from './fixtures.js';

function makeApp() {
  const db = seedDb();
  return { db, app: createApp(db) };
}

const H = { headers: { 'x-vault-key': TEST_KEY } };

const json = (body: unknown, key = TEST_KEY) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-vault-key': key },
  body: JSON.stringify(body),
});

describe('API integration', () => {
  it('adjust → vault → undo round-trip', async () => {
    const { app } = makeApp();
    const adjust = await app.request(
      '/api/vault/adjust',
      json({ adjustments: [{ card_id: 'OGN-045', delta: 2 }], source: 'grid' }),
    );
    expect(adjust.status).toBe(200);
    const { batch_id } = (await adjust.json()) as { batch_id: string };

    const vault = await app.request('/api/vault', H);
    const rows = (await vault.json()) as { id: string; qty: number }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'OGN-045', qty: 2 });

    const undo = await app.request(`/api/vault/undo?batch_id=${batch_id}`, { method: 'POST', headers: { 'x-vault-key': TEST_KEY } });
    expect(undo.status).toBe(200);
    const after = (await (await app.request('/api/vault', H)).json()) as unknown[];
    expect(after).toHaveLength(0);
  });

  it('rapid bulk entry resolves numbers within the set', async () => {
    const { app } = makeApp();
    const res = await app.request(
      '/api/vault/bulk',
      json({ set_code: 'ogn', input: '45x3 67 999' }),
    );
    const body = (await res.json()) as BulkResponse;
    expect(body.candidates).toHaveLength(2);
    expect(body.candidates[0]).toMatchObject({ count: 3, confidence: 'high' });
    expect(body.candidates[0]!.card!.id).toBe('OGN-045');
    expect(body.unknown).toEqual([{ raw: '999', reason: 'no card OGN-999' }]);
  });

  it('csv import resolves rows', async () => {
    const { app } = makeApp();
    const res = await app.request(
      '/api/import/csv',
      json({ csv: 'set,number,qty,qty_foil\nOGN,112,4,1' }),
    );
    const body = (await res.json()) as BulkResponse;
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0]).toMatchObject({ count: 4, count_foil: 1 });
  });

  it('search finds cards by fuzzy name and by id', async () => {
    const { app } = makeApp();
    const byName = await app.request('/api/cards?q=peace', H);
    const { cards } = (await byName.json()) as { cards: { id: string }[] };
    expect(cards.map((c) => c.id)).toContain('OGN-112');

    const byId = await app.request('/api/cards?q=ogn-45', H);
    const idHit = (await byId.json()) as { cards: { id: string }[] };
    expect(idHit.cards[0]!.id).toBe('OGN-045');
  });

  it('deck import + diff gives a correct missing list', async () => {
    const { app } = makeApp();
    // Own 2 Void Gate (1 foil), 1 Peacemaker
    await app.request(
      '/api/vault/adjust',
      json({
        adjustments: [
          { card_id: 'OGN-045', delta: 1, delta_foil: 1 },
          { card_id: 'OGN-112', delta: 1 },
        ],
      }),
    );
    const created = await app.request(
      '/api/decks',
      json({
        name: 'Test Deck',
        text: '3 Void Gate\n2x Piltover Peacemaker\n1 Jinx, Loose Cannon\n2 Totally Made Up Card',
      }),
    );
    expect(created.status).toBe(201);
    const deck = (await created.json()) as { id: number; unresolved: string[] };
    expect(deck.unresolved).toEqual(['2 Totally Made Up Card']);

    const diffRes = await app.request(`/api/decks/${deck.id}/diff`, H);
    const diff = (await diffRes.json()) as DeckDiff;
    // have: Void Gate (need 3, have 2+foil=2? no: 1+1=2 <3 → missing)
    expect(diff.total_need).toBe(6);
    const missingIds = diff.missing.map((r) => r.card.id).sort();
    expect(missingIds).toEqual(['OGN-045', 'OGN-067', 'OGN-112']);
    const voidGate = diff.missing.find((r) => r.card.id === 'OGN-045')!;
    expect(voidGate).toMatchObject({ need: 3, have: 2 }); // foils count
    expect(diff.total_missing).toBe(1 + 1 + 1);
  });

  it('recommendations rank meta decks by buildability', async () => {
    const { app } = makeApp();
    await app.request(
      '/api/vault/adjust',
      json({ adjustments: [{ card_id: 'OGN-045', delta: 3 }] }),
    );
    // Deck A: 3x Void Gate → 100%. Deck B: 3x Jinx → 0%.
    await app.request('/api/decks', json({ kind: 'meta', name: 'A', text: '3 Void Gate' }));
    await app.request('/api/decks', json({ kind: 'meta', name: 'B', text: '3 Jinx, Loose Cannon' }));

    const res = await app.request('/api/recommendations', H);
    const body = (await res.json()) as RecommendationsResponse;
    expect(body.decks.map((d) => d.deck.name)).toEqual(['A', 'B']);
    expect(body.decks[0]).toMatchObject({ ready: true, completion: 1 });
    expect(body.most_wanted[0]!.card.id).toBe('OGN-067');
    expect(body.most_wanted[0]!.copies_needed_total).toBe(3);
  });

  it('products expand into a single undoable batch', async () => {
    const { app, db } = makeApp();
    db.prepare("INSERT INTO products (id, name, set_code) VALUES ('p1', 'Test Precon', 'OGN')").run();
    db.prepare("INSERT INTO product_cards (product_id, card_id, qty) VALUES ('p1', 'OGN-045', 3)").run();
    db.prepare("INSERT INTO product_cards (product_id, card_id, qty) VALUES ('p1', 'OGN-112', 2)").run();

    const res = await app.request('/api/vault/add-product', json({ product_id: 'p1' }));
    expect(res.status).toBe(200);
    const { batch_id } = (await res.json()) as { batch_id: string };

    const vault = (await (await app.request('/api/vault', H)).json()) as { qty: number }[];
    expect(vault.reduce((n, r) => n + r.qty, 0)).toBe(5);

    const undo = await app.request(`/api/vault/undo?batch_id=${batch_id}`, { method: 'POST', headers: { 'x-vault-key': TEST_KEY } });
    expect(undo.status).toBe(200);
  });

  it('rejects requests without a valid key', async () => {
    const { app } = makeApp();
    expect((await app.request('/api/vault')).status).toBe(401);
    expect((await app.request('/api/vault', { headers: { 'x-vault-key': 'wrong' } })).status).toBe(401);
    expect((await app.request('/api/health')).status).toBe(200); // open for uptime checks
  });

  it('identifies the user via /api/me', async () => {
    const { app } = makeApp();
    const me = (await (await app.request('/api/me', H)).json()) as { name: string };
    expect(me.name).toBe('test');
  });

  it('isolates vaults per user but shares meta decks', async () => {
    const { app } = makeApp();
    // test user owns 3 Void Gate; other user owns nothing
    await app.request('/api/vault/adjust', json({ adjustments: [{ card_id: 'OGN-045', delta: 3 }] }));

    const otherVault = (await (
      await app.request('/api/vault', { headers: { 'x-vault-key': OTHER_KEY } })
    ).json()) as unknown[];
    expect(otherVault).toHaveLength(0);

    // meta deck created by test user is visible to both; personal deck is not
    await app.request('/api/decks', json({ kind: 'meta', name: 'Shared', text: '3 Void Gate' }));
    await app.request('/api/decks', json({ kind: 'mine', name: 'Private', text: '1 Void Gate' }));
    const otherDecks = (await (
      await app.request('/api/decks', { headers: { 'x-vault-key': OTHER_KEY } })
    ).json()) as { name: string; id: number }[];
    expect(otherDecks.map((d) => d.name)).toEqual(['Shared']);

    // the shared meta deck diffs differently per vault
    const sharedId = otherDecks[0]!.id;
    const mineDiff = (await (await app.request(`/api/decks/${sharedId}/diff`, H)).json()) as DeckDiff;
    const otherDiff = (await (
      await app.request(`/api/decks/${sharedId}/diff`, { headers: { 'x-vault-key': OTHER_KEY } })
    ).json()) as DeckDiff;
    expect(mineDiff.completion).toBe(1);
    expect(otherDiff.completion).toBe(0);
  });

  it('export produces the documented CSV shape', async () => {
    const { app } = makeApp();
    await app.request(
      '/api/vault/adjust',
      json({ adjustments: [{ card_id: 'OGN-067', delta: 2, delta_foil: 1 }] }),
    );
    const res = await app.request('/api/export', H);
    const csv = await res.text();
    expect(csv.split('\n')[0]).toBe('set,number,name,qty,qty_foil');
    expect(csv).toContain('OGN,67,"Jinx, Loose Cannon",2,1');
  });
});
