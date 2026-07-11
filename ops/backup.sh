#!/usr/bin/env bash
# Nightly SQLite backup: dated copy via the proper .backup API, keep 14.
# Cron:  15 3 * * *  /path/to/repo/ops/backup.sh
set -euo pipefail

DATA_DIR="${DATA_DIR:-$(cd "$(dirname "$0")/.." && pwd)/data}"
DB="$DATA_DIR/vault.db"
BACKUP_DIR="$DATA_DIR/backups"
KEEP=14

[ -f "$DB" ] || { echo "no database at $DB"; exit 1; }
mkdir -p "$BACKUP_DIR"

STAMP=$(date +%Y-%m-%d)
sqlite3 "$DB" ".backup '$BACKUP_DIR/vault-$STAMP.db'"

# prune oldest beyond KEEP
ls -1t "$BACKUP_DIR"/vault-*.db 2>/dev/null | tail -n "+$((KEEP + 1))" | xargs -r rm --
echo "backup ok: vault-$STAMP.db ($(ls -1 "$BACKUP_DIR" | wc -l) kept)"
