#!/usr/bin/env bash
# Git-based deploy script — run on the server.
#
# Usage:
#   cd <project root on server>
#   ./scripts/deploy.sh [branch]
#
# Workflow:
#   1. git fetch + reset to origin/<branch> (default: main)
#   2. npm ci + build web and backend
#   3. graceful restart via whichever process manager is active:
#      - PM2 (preferred)
#      - systemd (if service file is installed)
#      - ISPmanager (touch tmp/restart.txt or similar)
#      - fallback: kill + relaunch through auto-restart.sh
#
# Exit codes:
#   0 success, non-zero on any step failure (safe to retry).

set -euo pipefail

BRANCH="${1:-main}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_NAME="${SERVICE_NAME:-children}"

cd "$PROJECT_ROOT"
echo "==> Deploying branch '$BRANCH' in $PROJECT_ROOT"

# ---- 1. Git sync ----
if [ ! -d .git ]; then
  echo "ERROR: not a git repository. Initialize it first or clone fresh." >&2
  exit 1
fi

# Stash any unexpected local changes (shouldn't be any on a server, but be safe)
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "WARNING: local changes detected, stashing before deploy"
  git stash push -u -m "auto-stash-before-deploy-$(date +%s)" || true
fi

echo "==> git fetch"
git fetch --prune origin "$BRANCH"

echo "==> git reset --hard origin/$BRANCH"
git reset --hard "origin/$BRANCH"

# ---- 2. Build ----
echo "==> Installing and building web"
(cd web && npm ci && npm run build)

echo "==> Installing and building backend (clean dist to avoid stale incremental cache)"
(cd backend && npm ci && rm -rf dist tsconfig.tsbuildinfo && npm run build)

# Copy web build → frontend/build for backend static serving (matches main.ts discovery).
# Vite is configured to output to web/build (see web/vite.config.ts), but accept web/dist as fallback.
WEB_BUILD=""
if [ -f web/build/index.html ]; then
  WEB_BUILD="web/build"
elif [ -f web/dist/index.html ]; then
  WEB_BUILD="web/dist"
fi
if [ -n "$WEB_BUILD" ]; then
  mkdir -p frontend/build
  rm -rf frontend/build/*
  cp -r "$WEB_BUILD"/* frontend/build/
  echo "==> Copied $WEB_BUILD → frontend/build"
else
  echo "ERROR: web build not found in web/build or web/dist" >&2
  exit 1
fi

# ---- 3. Restart ----
echo "==> Restarting service"

restarted=0

# Option A: PM2
if command -v pm2 >/dev/null 2>&1 && pm2 jlist 2>/dev/null | grep -q "\"name\":\"$SERVICE_NAME\""; then
  pm2 reload "$SERVICE_NAME" --update-env
  restarted=1
  echo "    PM2: reloaded $SERVICE_NAME"
fi

# Option B: systemd (user or system unit)
if [ "$restarted" -eq 0 ] && command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet "$SERVICE_NAME.service" 2>/dev/null; then
    sudo systemctl restart "$SERVICE_NAME.service"
    restarted=1
    echo "    systemd: restarted $SERVICE_NAME.service"
  elif systemctl --user is-active --quiet "$SERVICE_NAME.service" 2>/dev/null; then
    systemctl --user restart "$SERVICE_NAME.service"
    restarted=1
    echo "    systemd --user: restarted $SERVICE_NAME.service"
  fi
fi

# Option C: ISPmanager touch-restart
if [ "$restarted" -eq 0 ] && [ -d backend/tmp ]; then
  touch backend/tmp/restart.txt
  restarted=1
  echo "    ISPmanager: touched backend/tmp/restart.txt"
fi

# Option D: fallback — kill the supervisor and it will respawn
if [ "$restarted" -eq 0 ]; then
  pkill -f "auto-restart.sh.*$SERVICE_NAME" 2>/dev/null || true
  echo "    fallback: nothing managed — relying on auto-restart supervisor (if running)"
fi

echo "==> Deploy complete"
