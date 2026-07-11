import { randomUUID } from 'node:crypto';
import type { Db } from '../db.js';

/**
 * Users are identified by their access key (the x-vault-key header the web
 * client already sends). No login flow: the owner creates users via
 * `npm run add-user -- --name alice` and hands out keys. Cards, sets,
 * products and meta decks are shared; vaults, history and personal decks
 * are per-user.
 */
export interface User {
  id: number;
  name: string;
  key: string;
  created_at: string;
}

export function findUserByKey(db: Db, key: string): User | null {
  if (!key) return null;
  return (db.prepare('SELECT * FROM users WHERE key = ?').get(key) as User) ?? null;
}

export function listUsers(db: Db): User[] {
  return db.prepare('SELECT * FROM users ORDER BY id').all() as User[];
}

export function createUser(db: Db, name: string, key?: string): User {
  const finalKey = key ?? randomUUID();
  db.prepare('INSERT INTO users (name, key, created_at) VALUES (?, ?, ?)').run(
    name,
    finalKey,
    new Date().toISOString(),
  );
  return findUserByKey(db, finalKey)!;
}

/**
 * Guarantee at least one user exists (first boot / legacy migration).
 * Seeds the key from VAULT_KEY when set so existing setups keep working.
 */
export function ensureDefaultUser(db: Db, seedKey?: string): { user: User; created: boolean } {
  const first = db.prepare('SELECT * FROM users ORDER BY id LIMIT 1').get() as User | undefined;
  if (first) return { user: first, created: false };
  const user = createUser(db, 'owner', seedKey || undefined);
  console.log('='.repeat(64));
  console.log(`  Created initial user 'owner' with access key:`);
  console.log(`      ${user.key}`);
  console.log(`  Enter it on the app's Home screen. Recover keys any time`);
  console.log(`  with: npm run add-user -- --list`);
  console.log('='.repeat(64));
  return { user, created: true };
}
