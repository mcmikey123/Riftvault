# Riftbound Vault

Collection tracker for the Riftbound TCG. Core loop: get physical cards into
the vault with minimal effort, then diff any decklist against the vault to
see what's missing.

Supports a small group of users on one instance: the card database, sealed
products and meta decks are shared; each person has their own vault, history
and personal decks, identified by an access key.

- **Frontend** — Vite + React + TypeScript PWA (`apps/web`), mobile-first,
  installable, camera access for scanning.
- **Backend** — Hono on Node + SQLite via better-sqlite3 (`apps/server`),
  single process under PM2, fronted by Caddy.
- **AI** — Anthropic vision (`claude-haiku-4-5`, Sonnet fallback toggle) for
  photo batch scanning.

## Quick start (dev)

```bash
npm install
npm run sync-cards        # pull the card database from RiftScribe
npm run dev               # server :8787 + web :5173 (proxied)
```

Open http://localhost:5173. The card database is synced, never typed — if
`sync-cards` fails, see **Card sync** below.

## Users & access keys

Every API request carries an `x-vault-key` header; the key identifies the
user (no separate login). On first boot a user named `owner` is created —
its key is printed to the console (seeded from `VAULT_KEY` when set, random
otherwise). Add more people with:

```bash
npm run add-user -- --name alice     # prints their key
npm run add-user -- --list           # recover keys
```

Each person enters their key once on the app's Home screen. Shared between
everyone: cards, sets, sealed products, meta decks. Per-person: vault,
undo history, decks imported as "My deck". Pre-multi-user databases are
migrated automatically; existing data goes to the first user.

## Entry modes

| Mode | Where | Notes |
| --- | --- | --- |
| Set checklist grid | Sets → pick set | steppers, long-press for foils; the correction surface for everything else |
| Fuzzy search | Search | loose singles, local FTS5 |
| Precon one-tap | Products | fixtures in `packages/data/products/` (see its README — verified contents only) |
| Rapid number entry | Rapid | `45x3 67 112 203x2` scoped to one set |
| CSV import | CSV | `set,number,qty[,qty_foil]` |
| Photo scan | Scan | resize client-side, quadrant slicing for binder pages, confirm screen, undoable batch |

Every bulk mode resolves to the same confirm screen and commits as one
`batch_id` in `vault_log` — the Undo toast reverses the whole batch.

## Decks

Paste any common decklist format (`3 Card Name`, `3x Card Name`,
`Card Name x3`, `3 OGN-045`), or a Piltover Archive deck URL. Unresolved
lines are kept and fixable in the deck view via the search picker.
`GET /api/decks/:id/diff` powers the green/amber/red diff view with a
copyable buylist. Meta decks (`kind='meta'`) feed the **Buildable** screen:
completion %, rarity-weighted cost proxy (constants in
`apps/server/src/lib/buildability.ts`), "nearly there" badges and the
aggregate most-wanted list.

## Card sync

`npm run sync-cards` pulls all sets from RiftScribe into the local `cards`
table (idempotent upsert; weekly cron recommended) and seeds product
fixtures.

> The client was verified against RiftScribe's live OpenAPI spec on
> 2026-07-11: `GET /api/cards` paginates via `limit` (max 200) + `offset`
> and returns a bare JSON array. Alt-art variants share a collector number;
> the base printing wins (the schema is `UNIQUE(set_code, collector_number)`).
> Full payloads are kept in `cards.raw_json`, so re-mapping is lossless if
> the API changes — `test/riftscribeMap.test.ts` pins the expected shape.

Fallback source: Riot's card gallery JSON, stubbed behind the same
`CardSource` interface (`CARD_SOURCE=riot`) — implement
`cardSource/riot.ts` if RiftScribe ever dies.

Card images are cached to disk on first request
(`data/img-cache/{card_id}.webp`, ~300px) — RiftScribe is hotlinked exactly
once per card.

## Photo scanning (Phase 2)

`POST /api/scan` accepts up to 6 images (client resizes to ~1600px long
edge; "binder mode" slices a page photo into 4 overlapping crops sent in one
request). The vision prompt is name-primary — collector numbers are only a
tiebreaker. Server-side validation trigram-matches extracted names against
the local card table, defaults multiple printings to the base printing, and
never writes to the vault — the confirm screen commits. Requires
`ANTHROPIC_API_KEY`. A per-day request/token counter is kept in
`scan_usage` and shown on the Scan screen.

## Tests

```bash
npm test
```

Vitest covers the deterministic core: rapid-entry parser, decklist parser
(messy fixtures included), CSV parser, scan-JSON parser, scan name resolver
(OCR-miss fixtures), buildability scoring + most-wanted aggregation
(hand-computed checks), vault store batch/clamp/undo semantics, and API
integration against an in-memory DB.

## Deploy (Hetzner + PM2 + Caddy)

GitHub Actions (`.github/workflows/deploy.yml`) tests, builds, rsyncs to the
box (excluding `data/`) and `pm2 startOrReload`s. Secrets: `DEPLOY_HOST`,
`DEPLOY_USER`, `DEPLOY_PATH`, `DEPLOY_SSH_KEY`.

On the box:

```bash
cp .env.example .env             # or set env in ecosystem.config.cjs
pm2 start ecosystem.config.cjs && pm2 save
```

- Caddy: `ops/Caddyfile.example` (basic auth; `VAULT_KEY` header is optional
  extra).
- Backups: `ops/backup.sh` on a nightly cron — dated `sqlite3 .backup`
  copies, keeps 14.
- Card sync: `cd $DEPLOY_PATH && npm run sync-cards` on a weekly cron.

`data/` (SQLite, image cache, backups) lives next to the repo and is never
touched by deploys.

## Not built (by design)

Auth beyond the shared secret, theming beyond dark mode, prices,
multi-user, video scanning. Phase 3 voice entry is speced but deliberately
unbuilt — the scan + rapid entry loop covers it so far.
