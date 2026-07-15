/** Shared types between the Hono server and the React PWA. */

export interface Card {
  id: string; // e.g. 'OGN-045'
  set_code: string;
  collector_number: number;
  name: string;
  type: string | null;
  faction: string | null;
  rarity: string | null;
  image_url: string | null;
}

export interface VaultRow extends Card {
  qty: number;
  qty_foil: number;
  updated_at: string;
  /** Latest known market price per copy; null until a price source covers this card. */
  price?: number | null;
  price_foil?: number | null;
  currency?: string | null;
  price_updated_at?: string | null;
}

/** Line value of a vault row: regular copies + foils (foil price falls back to regular). */
export function rowValue(row: VaultRow): number | null {
  const price = row.price ?? null;
  const foilPrice = row.price_foil ?? price;
  if (price === null && foilPrice === null) return null;
  return row.qty * (price ?? 0) + row.qty_foil * (foilPrice ?? 0);
}

export type EntrySource =
  | 'grid'
  | 'search'
  | 'scan'
  | 'voice'
  | 'undo'
  | 'product'
  | 'bulk'
  | 'csv';

export interface Adjustment {
  card_id: string;
  delta: number;
  delta_foil?: number;
}

export interface AdjustResult {
  batch_id: string;
  rows: { card_id: string; qty: number; qty_foil: number }[];
}

/**
 * A row on the confirm screen. Every bulk entry mode (rapid numbers, CSV,
 * scan, product) resolves into a list of these; nothing is written to the
 * vault until the user confirms the batch.
 */
export interface Candidate {
  /** Resolved card, or null when the input could not be matched. */
  card: Card | null;
  count: number;
  count_foil?: number;
  confidence: 'high' | 'low';
  /** Human-readable reason a row needs attention (unknown number, fuzzy match…). */
  flag?: string;
  /** Alternative printings / fuzzy matches, one tap away on the confirm screen. */
  alternatives?: Card[];
  /** The raw input token/line/extraction this row came from. */
  raw?: string;
}

export interface BulkResponse {
  candidates: Candidate[];
  unknown: { raw: string; reason: string }[];
}

export interface Product {
  id: string;
  name: string;
  set_code: string | null;
  cards: { card: Card; qty: number }[];
  total_cards: number;
}

export interface Deck {
  id: number;
  name: string;
  kind: 'mine' | 'meta';
  source_url: string | null;
  archetype: string | null;
  popularity_rank: number | null;
  source_text: string;
  created_at: string;
  updated_at: string | null;
  card_count: number;
  unresolved: string[];
}

export interface DiffRow {
  card: Card;
  need: number;
  have: number;
}

export interface DeckDiff {
  deck: { id: number; name: string; kind: string };
  have: DiffRow[];
  /** Cards short of the required count, including partials (have > 0). */
  missing: DiffRow[];
  total_missing: number;
  total_need: number;
  completion: number;
}

export interface DeckScore {
  deck: {
    id: number;
    name: string;
    kind: string;
    archetype: string | null;
    popularity_rank: number | null;
    source_url: string | null;
  };
  completion: number; // 0..1
  missing_count: number; // total copies short
  missing_unique: number; // distinct cards short
  cost_proxy: number; // missing copies weighted by rarity
  ready: boolean;
  nearly_there: boolean;
  missing: DiffRow[];
}

export interface MostWantedRow {
  card: Card;
  decks_count: number;
  copies_needed_total: number;
  weight: number;
}

export interface RecommendationsResponse {
  decks: DeckScore[];
  most_wanted: MostWantedRow[];
}

export interface ScanExtraction {
  name: string;
  set_code?: string | null;
  collector_number?: number | null;
  count: number;
  confidence: 'high' | 'low';
}

export interface ScanResponse {
  candidates: Candidate[];
  usage: { date: string; requests: number; input_tokens: number; output_tokens: number };
  model: string;
}

export interface SetSummary {
  set_code: string;
  /** Display name from the sets table; null until the source provides one. */
  name: string | null;
  card_count: number;
  owned_unique: number;
  owned_total: number;
  completion: number;
}

export interface VaultSummary {
  total_cards: number;
  unique_cards: number;
  sets: SetSummary[];
}
