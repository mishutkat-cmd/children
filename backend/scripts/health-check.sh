#!/usr/bin/env bash
# Health check via unix socket or HTTP port
# Usage: SOCKET_PATH=/path/to.sock ./health-check.sh
#    or: PORT=3000 ./health-check.sh
set -e

SOCKET="${SOCKET_PATH:-${PORT:-}}"

if [[ -z "$SOCKET" ]]; then
  echo "ERROR: Set SOCKET_PATH or PORT environment variable"
  exit 1
fi

echo "Checking health at: $SOCKET"

if [[ "$SOCKET" == /* ]]; then
  # Unix socket
  if [[ ! -S "$SOCKET" ]]; then
    echo "ERROR: Socket file does not exist: $SOCKET"
    exit 1
  fi
  RESPONSE=$(curl -s --unix-socket "$SOCKET" http://localhost/health 2>&1) || {
    echo "ERROR: curl failed"
    exit 1
  }
else
  # TCP port
  RESPONSE=$(curl -s "http://localhost:$SOCKET/health" 2>&1) || {
    echo "ERROR: curl failed"
    exit 1
  }
fi

echo "Response: $RESPONSE"

# Check for ok:true in response
if echo "$RESPONSE" | grep -q '"ok":\s*true'; then
  echo "✅ Health check passed"
  exit 0
else
  echo "❌ Health check failed"
  exit 1
fi
