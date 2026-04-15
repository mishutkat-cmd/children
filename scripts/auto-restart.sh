#!/usr/bin/env bash
# Minimal supervisor: keeps `node server.js` alive.
# Restarts on crash with exponential backoff (capped at 30s).
# Writes logs to backend/logs/server.log and backend/logs/server.err.
#
# Usage:
#   ./scripts/auto-restart.sh           # runs in foreground (use with nohup / screen / tmux)
#   SERVICE_NAME=children ./scripts/auto-restart.sh
#
# Stop: send SIGTERM or SIGINT — script will kill its child and exit cleanly.

set -u

SERVICE_NAME="${SERVICE_NAME:-children}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
LOG_DIR="$BACKEND_DIR/logs"
mkdir -p "$LOG_DIR"

LOG_OUT="$LOG_DIR/server.log"
LOG_ERR="$LOG_DIR/server.err"
PID_FILE="$LOG_DIR/$SERVICE_NAME.pid"
echo $$ > "$PID_FILE"

CHILD_PID=""

cleanup() {
  echo "[supervisor] received stop signal, shutting down child $CHILD_PID" >&2
  if [ -n "$CHILD_PID" ] && kill -0 "$CHILD_PID" 2>/dev/null; then
    kill -TERM "$CHILD_PID" 2>/dev/null || true
    # wait up to 10s for graceful shutdown
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "$CHILD_PID" 2>/dev/null || break
      sleep 1
    done
    kill -KILL "$CHILD_PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  exit 0
}
trap cleanup INT TERM

BACKOFF=1
MAX_BACKOFF=30

while true; do
  START_TS=$(date +%s)
  echo "[supervisor] starting $SERVICE_NAME at $(date -Iseconds)" | tee -a "$LOG_OUT"

  cd "$BACKEND_DIR"
  node server.js >> "$LOG_OUT" 2>> "$LOG_ERR" &
  CHILD_PID=$!
  echo "[supervisor] child pid=$CHILD_PID" | tee -a "$LOG_OUT"

  wait "$CHILD_PID" 2>/dev/null
  EXIT_CODE=$?
  END_TS=$(date +%s)
  UPTIME=$((END_TS - START_TS))

  echo "[supervisor] child exited code=$EXIT_CODE after ${UPTIME}s" | tee -a "$LOG_OUT"

  # If the child ran for at least 60s, reset backoff — it was a stable run.
  if [ "$UPTIME" -ge 60 ]; then
    BACKOFF=1
  fi

  echo "[supervisor] restarting in ${BACKOFF}s" | tee -a "$LOG_OUT"
  sleep "$BACKOFF"

  BACKOFF=$((BACKOFF * 2))
  if [ "$BACKOFF" -gt "$MAX_BACKOFF" ]; then
    BACKOFF=$MAX_BACKOFF
  fi
done
