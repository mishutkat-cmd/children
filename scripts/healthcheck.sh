#!/usr/bin/env bash
# External watchdog — hits /health; if it fails N times in a row, restarts service.
#
# Schedule via cron, every 1 minute:
#   * * * * * /path/to/scripts/healthcheck.sh >> /path/to/backend/logs/healthcheck.log 2>&1
#
# Env:
#   HEALTH_URL=http://127.0.0.1:3000/health  (default)
#   SERVICE_NAME=children                    (default)
#   FAIL_THRESHOLD=3                         (consecutive failures before restart)
#   STATE_FILE=backend/logs/health.state     (counter persistence)

set -u

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/health}"
SERVICE_NAME="${SERVICE_NAME:-children}"
FAIL_THRESHOLD="${FAIL_THRESHOLD:-3}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE_FILE="${STATE_FILE:-$PROJECT_ROOT/backend/logs/health.state}"

mkdir -p "$(dirname "$STATE_FILE")"
FAIL_COUNT=$(cat "$STATE_FILE" 2>/dev/null || echo 0)

# Try /health, fail fast (5s connect, 10s total)
if curl -fsS --connect-timeout 5 --max-time 10 "$HEALTH_URL" >/dev/null 2>&1; then
  # healthy — reset counter
  echo 0 > "$STATE_FILE"
  exit 0
fi

FAIL_COUNT=$((FAIL_COUNT + 1))
echo "$FAIL_COUNT" > "$STATE_FILE"
echo "[$(date -Iseconds)] health check failed ($FAIL_COUNT/$FAIL_THRESHOLD) for $HEALTH_URL" >&2

if [ "$FAIL_COUNT" -lt "$FAIL_THRESHOLD" ]; then
  exit 1
fi

echo "[$(date -Iseconds)] threshold reached, restarting $SERVICE_NAME" >&2
echo 0 > "$STATE_FILE"

# Try PM2 → systemd → ISPmanager touch → supervisor kill
if command -v pm2 >/dev/null 2>&1 && pm2 jlist 2>/dev/null | grep -q "\"name\":\"$SERVICE_NAME\""; then
  pm2 restart "$SERVICE_NAME" && exit 0
fi

if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet "$SERVICE_NAME.service" 2>/dev/null; then
    sudo systemctl restart "$SERVICE_NAME.service" && exit 0
  elif systemctl --user is-active --quiet "$SERVICE_NAME.service" 2>/dev/null; then
    systemctl --user restart "$SERVICE_NAME.service" && exit 0
  fi
fi

if [ -d "$PROJECT_ROOT/backend/tmp" ]; then
  touch "$PROJECT_ROOT/backend/tmp/restart.txt"
  exit 0
fi

# Last resort: kill supervisor's child — it will respawn on next wait
pkill -f "auto-restart.sh.*$SERVICE_NAME" 2>/dev/null || true
exit 1
