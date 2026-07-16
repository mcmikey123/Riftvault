import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';
import { ensureDefaultUser } from './lib/users.js';

export type Db = Database.Database;

/**
 * Multi-user layout: cards/sets/products/meta-decks are shared; vault,
 * vault_log and personal decks are scoped by user_id. decks.user_id is
 * NULL for shared meta decks.
 */
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

CREATE TABLE IF NOT EXISTS sets (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vault (
  user_id INTEGER NOT NULL REFERENCES users(id),
  card_id TEXT NOT NULL REFERENCES cards(id),
  qty INTEGER NOT NULL DEFAULT 0,
  qty_foil INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, card_id)
);

CREATE TABLE IF NOT EXISTS vault_log (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
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
  user_id INTEGER,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'mine',
  source_url TEXT,
  archetype TEXT,
  popularity_rank INTEGER,
  meta_tier INTEGER,
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

CREATE TABLE IF NOT EXISTS card_prices (
  card_id TEXT PRIMARY KEY REFERENCES cards(id),
  price REAL,
  price_foil REAL,
  currency TEXT NOT NULL DEFAULT 'USD',
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL
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

function hasColumn(db: Db, table: string, column: string): boolean {
  const cols = db.pragma(`table_info(${table})`) as { name: string }[];
  return cols.some((c) => c.name === column);
}

function tableExists(db: Db, table: string): boolean {
  return !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
    .get(table);
}

/** Upgrade a pre-multi-user database in place; existing data goes to the first user. */
function migrateLegacy(db: Db, seedKey?: string) {
  const needVault = tableExists(db, 'vault') && !hasColumn(db, 'vault', 'user_id');
  const needLog = tableExists(db, 'vault_log') && !hasColumn(db, 'vault_log', 'user_id');
  const needDecks = tableExists(db, 'decks') && !hasColumn(db, 'decks', 'user_id');
  if (!needVault && !needLog && !needDecks) return;

  const { user } = ensureDefaultUser(db, seedKey);
  db.transaction(() => {
    if (needVault) {
      db.exec(`
        CREATE TABLE vault_v2 (
          user_id INTEGER NOT NULL REFERENCES users(id),
          card_id TEXT NOT NULL REFERENCES cards(id),
          qty INTEGER NOT NULL DEFAULT 0,
          qty_foil INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (user_id, card_id)
        );
      `);
      db.prepare(
        `INSERT INTO vault_v2 (user_id, card_id, qty, qty_foil, updated_at)
         SELECT ?, card_id, qty, qty_foil, updated_at FROM vault`,
      ).run(user.id);
      db.exec('DROP TABLE vault; ALTER TABLE vault_v2 RENAME TO vault;');
    }
    if (needLog) {
      db.exec('ALTER TABLE vault_log ADD COLUMN user_id INTEGER');
      db.prepare('UPDATE vault_log SET user_id = ?').run(user.id);
    }
    if (needDecks) {
      db.exec('ALTER TABLE decks ADD COLUMN user_id INTEGER');
      db.prepare("UPDATE decks SET user_id = ? WHERE kind = 'mine'").run(user.id);
    }
  })();
  console.log(`[db] migrated to multi-user layout — existing data belongs to '${user.name}'`);
}

export function createDb(dbPath: string, seedUserKey?: string): Db {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // Legacy tables must be upgraded before the IF NOT EXISTS schema would
  // otherwise coexist with them; migration is a no-op on fresh/new DBs.
  db.exec(SCHEMA);
  migrateLegacy(db, seedUserKey);
  if (tableExists(db, 'decks') && !hasColumn(db, 'decks', 'meta_tier')) {
    db.exec('ALTER TABLE decks ADD COLUMN meta_tier INTEGER');
  }
  return db;
}

let defaultDb: Db | null = null;

export function getDb(): Db {
  if (!defaultDb) defaultDb = createDb(env.dbPath, env.vaultKey || undefined);
  return defaultDb;
}
