// PM2 process file. On the Hetzner box:
//   pm2 start ecosystem.config.cjs
//   pm2 save
module.exports = {
  apps: [
    {
      name: 'riftvault',
      cwd: __dirname,
      script: 'node_modules/.bin/tsx',
      args: 'apps/server/src/index.ts',
      env: {
        NODE_ENV: 'production',
        PORT: 8787,
        // DATA_DIR defaults to <repo>/data — excluded from deploys
        // VAULT_KEY: 'set-me-or-rely-on-caddy-basic-auth',
        // ANTHROPIC_API_KEY: 'sk-ant-…',  // required for /api/scan
      },
      max_memory_restart: '300M',
    },
  ],
};
