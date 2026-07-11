import { Hono } from 'hono';
import type { DeckScore, RecommendationsResponse } from '@riftvault/types';
import type { Db } from '../db.js';
import { mostWanted, rankDecks, scoreDeck } from '../lib/buildability.js';
import type { User } from '../lib/users.js';
import { deckRequirements } from './decks.js';

type AppEnv = { Variables: { user: User } };

export function recommendationsRoutes(db: Db) {
  const app = new Hono<AppEnv>();

  app.get('/recommendations', (c) => {
    const decks = db
      .prepare(
        `SELECT id, name, kind, archetype, popularity_rank, source_url
         FROM decks WHERE kind = 'meta'`,
      )
      .all() as DeckScore['deck'][];

    const scores: DeckScore[] = decks.map((deck) => {
      const reqs = deckRequirements(db, deck.id, c.get('user').id).map(({ need, have, ...card }) => ({
        card,
        need,
        have,
      }));
      const s = scoreDeck(reqs);
      return {
        deck,
        completion: s.completion,
        missing_count: s.missing_count,
        missing_unique: s.missing_unique,
        cost_proxy: s.cost_proxy,
        ready: s.ready,
        nearly_there: s.nearly_there,
        missing: s.missing,
      };
    });

    const ranked = rankDecks(scores);
    const response: RecommendationsResponse = {
      decks: ranked,
      most_wanted: mostWanted(ranked).slice(0, 30),
    };
    return c.json(response);
  });

  return app;
}
