#!/bin/bash
#
# Резервная копия базы Kids Motivation.
#
# Firestore делал бэкапы сам — после переезда на SQLite это наша забота.
#
# Копия снимается через `VACUUM INTO`, а не `cp`: база работает в режиме WAL,
# поэтому простое копирование файла может застать его между контрольными
# точками и дать повреждённый или отставший снимок. `VACUUM INTO` выполняется
# на живой базе и всегда даёт консистентный результат.
#
# Cron:
#   15 4 * * * /home/odoo/crmproject/children/scripts/backup-db.sh >> /home/odoo/logs/children-backup.log 2>&1

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="${DATABASE_PATH:-$PROJECT_DIR/backend/data/children.db}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/children}"
KEEP_DAYS="${KEEP_DAYS:-30}"

timestamp="$(date +%Y%m%d-%H%M%S)"
target="$BACKUP_DIR/children-$timestamp.db"

echo "[$(date '+%F %T')] backup start: $DB_PATH -> $target"

if [ ! -f "$DB_PATH" ]; then
  echo "ERROR: database not found at $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# VACUUM INTO отказывается писать в существующий файл — имя с таймстемпом это
# уже гарантирует, но при повторном запуске в ту же секунду подстрахуемся.
if [ -e "$target" ]; then
  echo "ERROR: backup target already exists: $target" >&2
  exit 1
fi

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" "VACUUM INTO '$target'"
else
  # sqlite3 CLI на сервере может отсутствовать — better-sqlite3 стоит всегда,
  # он приносит собственный движок.
  node -e "
    const Database = require('$PROJECT_DIR/backend/node_modules/better-sqlite3');
    const db = new Database('$DB_PATH', { readonly: true });
    db.exec(\"VACUUM INTO '$target'\");
    db.close();
  "
fi

gzip -f "$target"
echo "[$(date '+%F %T')] backup done: ${target}.gz ($(du -h "${target}.gz" | cut -f1))"

# Чистка старых копий. -mtime считает от времени модификации файла.
deleted="$(find "$BACKUP_DIR" -name 'children-*.db.gz' -type f -mtime "+$KEEP_DAYS" -print -delete | wc -l | tr -d ' ')"
if [ "$deleted" != "0" ]; then
  echo "[$(date '+%F %T')] removed $deleted backup(s) older than $KEEP_DAYS days"
fi

# Проверяем, что снятая копия действительно открывается и не повреждена —
# бэкап, который нельзя восстановить, хуже отсутствия бэкапа.
node -e "
  const { execSync } = require('child_process');
  const Database = require('$PROJECT_DIR/backend/node_modules/better-sqlite3');
  const os = require('os'), path = require('path'), fs = require('fs');
  const tmp = path.join(os.tmpdir(), 'children-verify-$timestamp.db');
  execSync(\"gunzip -c '${target}.gz' > '\" + tmp + \"'\");
  try {
    const db = new Database(tmp, { readonly: true });
    const check = db.pragma('integrity_check', { simple: true });
    const users = db.prepare('SELECT COUNT(*) n FROM \"users\"').get().n;
    db.close();
    if (check !== 'ok') { console.error('ERROR: integrity_check =', check); process.exit(1); }
    console.log('[verify] integrity ok, users =', users);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
"
