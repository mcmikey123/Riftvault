import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { getDb } from './db.js';
import { env } from './env.js';

const app = createApp(getDb());

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`riftbound-vault server listening on :${info.port}`);
  if (!env.vaultKey) {
    console.log('VAULT_KEY not set — API is open (fine behind Caddy basic auth)');
  }
});
