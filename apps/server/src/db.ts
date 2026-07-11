import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  set_code TEXT NOT NULL,
  collector_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT, faction TEXT, rarity TEXT,
  image_url TEXT,
  raw_json TEXT,
  UNIQUE(set_code, collector_number)
);

CREATE TABLE IF NOT EXISTS vault (
  card_id TEXT PRIMARY KEY REFERENCES cards(id),
  qty INTEGER NOT NULL DEFAULT 0,
  qty_foil INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vault_log (
  id INTEGER PRIMARY KEY,
  card_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  delta_foil INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  batch_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vault_log_batch ON vault_log(batch_id);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  set_code TEXT
);

CREATE TABLE IF NOT EXISTS product_cards (
  product_id TEXT REFERENCES products(id),
  card_id TEXT REFERENCES cards(id),
  qty INTEGER NOT NULL,
  PRIMARY KEY (product_id, card_id)
);

CREATE TABLE IF NOT EXISTS decks (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'mine',
  source_url TEXT,
  archetype TEXT,
  popularity_rank INTEGER,
  source_text TEXT NOT NULL,
  unresolved_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS deck_cards (
  deck_id INTEGER REFERENCES decks(id),
  card_id TEXT REFERENCES cards(id),
  qty INTEGER NOT NULL,
  PRIMARY KEY (deck_id, card_id)
);

CREATE TABLE IF NOT EXISTS scan_usage (
  date TEXT PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0
);

CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(
  name,
  content='cards',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS cards_fts_ai AFTER INSERT ON cards BEGIN
  INSERT INTO cards_fts(rowid, name) VALUES (new.rowid, new.name);
END;
CREATE TRIGGER IF NOT EXISTS cards_fts_ad AFTER DELETE ON cards BEGIN
  INSERT INTO cards_fts(cards_fts, rowid, name) VALUES ('delete', old.rowid, old.name);
END;
CREATE TRIGGER IF NOT EXISTS cards_fts_au AFTER UPDATE OF name ON cards BEGIN
  INSERT INTO cards_fts(cards_fts, rowid, name) VALUES ('delete', old.rowid, old.name);
  INSERT INTO cards_fts(rowid, name) VALUES (new.rowid, new.name);
END;
`;

export function createDb(dbPath: string): Db {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

let defaultDb: Db | null = null;

export function getDb(): Db {
  if (!defaultDb) defaultDb = createDb(env.dbPath);
  return defaultDb;
}
