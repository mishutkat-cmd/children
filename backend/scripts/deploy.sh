#!/usr/bin/env bash
# Deploy script for children.evolvenext.net backend
# Run from backend/ directory
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
SOCKET_PATH="${SOCKET_PATH:-/home/pf246008/.system/nodejs/children.evolvenext.net.sock}"
LOG_FILE="${LOG_FILE:-/tmp/children-backend.out}"

cd "$BACKEND_DIR"

echo "=== Deploying Backend ==="
echo "Backend dir: $BACKEND_DIR"
echo "Socket path: $SOCKET_PATH"

# 1. Stop existing process
echo ""
echo "1. Stopping existing processes..."
pkill -f "node dist/main.js" 2>/dev/null && echo "   Killed existing process" || echo "   No existing process"
sleep 1

# 2. Remove old socket
echo ""
echo "2. Cleaning old socket..."
rm -f "$SOCKET_PATH" && echo "   Removed: $SOCKET_PATH" || echo "   No socket to remove"

# 3. Install dependencies
echo ""
echo "3. Installing dependencies..."
npm ci --omit=dev

# 4. Check dist/main.js exists
echo ""
echo "4. Checking build..."
if [[ ! -f "dist/main.js" ]]; then
  echo "   ERROR: dist/main.js not found. Run 'npm run build' first."
  exit 1
fi
node --check dist/main.js
echo "   dist/main.js OK"

# 5. Start backend
echo ""
echo "5. Starting backend..."
export PORT="$SOCKET_PATH"
export NODE_ENV=production

nohup node dist/main.js >> "$LOG_FILE" 2>&1 &
PID=$!
echo "   Started with PID: $PID"

# 6. Wait for socket
echo ""
echo "6. Waiting for socket..."
for i in {1..10}; do
  if [[ -S "$SOCKET_PATH" ]]; then
    echo "   Socket created: $SOCKET_PATH"
    break
  fi
  sleep 1
done

if [[ ! -S "$SOCKET_PATH" ]]; then
  echo "   ERROR: Socket not created after 10s"
  echo "   Last 20 lines of log:"
  tail -20 "$LOG_FILE"
  exit 1
fi

# 7. Health check
echo ""
echo "7. Health check..."
SOCKET_PATH="$SOCKET_PATH" bash scripts/health-check.sh

echo ""
echo "=== Deployment Complete ==="
echo "PID: $PID"
echo "Socket: $SOCKET_PATH"
echo "Logs: $LOG_FILE"
