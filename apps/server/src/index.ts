import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { getDb } from './db.js';
import { env } from './env.js';
import { ensureDefaultUser } from './lib/users.js';

const db = getDb();
// First boot (or fresh DB): make sure there's a user to hand a key to.
ensureDefaultUser(db, env.vaultKey || undefined);

const app = createApp(db);

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`riftbound-vault server listening on :${info.port}`);
  console.log('manage users with: npm run add-user -- --name <name>   (or --list)');
});
