#!/bin/bash
# Prestart checks for production deployment
# Exit codes: 0 = OK, 1 = FAIL

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$BACKEND_DIR"

echo "[Prestart] Starting prestart checks..."

# 1. Check package.json exists
if [ ! -f "package.json" ]; then
  echo "[Prestart] FAIL: package.json not found"
  exit 1
fi
echo "[Prestart] ✓ package.json found"

# 2. Check node_modules exists
if [ ! -d "node_modules" ]; then
  echo "[Prestart] FAIL: node_modules not found. Run: npm install"
  exit 1
fi
echo "[Prestart] ✓ node_modules found"

# 3. Check compiled JavaScript (if start:prod)
if [ "$START_TYPE" = "prod" ] && [ ! -d "dist" ]; then
  echo "[Prestart] FAIL: dist/ not found. Run: npm run build"
  exit 1
fi

# 4. Check server.js syntax (production entry point)
if [ -f "server.js" ]; then
  if ! node --check server.js 2>/dev/null; then
    echo "[Prestart] FAIL: server.js has syntax errors"
    exit 1
  fi
  echo "[Prestart] ✓ server.js syntax OK"
fi

# 5. Check main.js exists when using server.js (server.js requires dist/main.js)
if [ -f "server.js" ] && [ "$START_TYPE" = "prod" ] && [ ! -f "dist/main.js" ]; then
  echo "[Prestart] FAIL: dist/main.js not found. Run: npm run build"
  exit 1
fi

# 6. Check main.js syntax (if exists)
if [ -f "dist/main.js" ]; then
  if ! node --check dist/main.js 2>/dev/null; then
    echo "[Prestart] FAIL: dist/main.js has syntax errors"
    exit 1
  fi
  echo "[Prestart] ✓ dist/main.js syntax OK"
fi

# 7. Check bcrypt — must use bcryptjs on shared hosting (ISPmanager), not native bcrypt
if grep -q '"bcrypt"' package.json 2>/dev/null; then
  echo "[Prestart] FAIL: bcrypt is not supported on shared hosting (ERR_DLOPEN_FAILED). Use bcryptjs."
  echo "[Prestart] Run: npm remove bcrypt && npm i bcryptjs && npm i -D @types/bcryptjs"
  exit 1
fi
if grep -q "bcryptjs" package.json 2>/dev/null; then
  if ! node -e "require('bcryptjs')" 2>/dev/null; then
    echo "[Prestart] WARN: bcryptjs listed but not found. Run: npm install bcryptjs"
  else
    echo "[Prestart] ✓ bcryptjs found"
  fi
fi

# 8. Check firebase-admin (if used)
if grep -q "firebase-admin" package.json 2>/dev/null; then
  if ! node -e "require('firebase-admin')" 2>/dev/null; then
    echo "[Prestart] WARN: firebase-admin listed but not found in node_modules"
    echo "[Prestart] Run: npm install firebase-admin"
  else
    echo "[Prestart] ✓ firebase-admin found"
  fi
fi

# 9. Prevent EADDRINUSE / two instances: best-effort check PORT or socket
PORT="${PORT:-}"
if [ -n "$PORT" ]; then
  if echo "$PORT" | grep -qE '^[0-9]+$'; then
    # PORT is numeric — check if port is in use (best effort)
    if command -v ss >/dev/null 2>&1; then
      if ss -lpn 2>/dev/null | grep -q ":$PORT "; then
        echo "[Prestart] WARN: Port $PORT appears in use (ss). Stop other process or use another port."
      else
        echo "[Prestart] ✓ Port $PORT not in use (ss)"
      fi
    elif command -v lsof >/dev/null 2>&1; then
      if lsof -i ":$PORT" 2>/dev/null | grep -q LISTEN; then
        echo "[Prestart] WARN: Port $PORT in use (lsof). Stop other process."
      else
        echo "[Prestart] ✓ Port $PORT not in use (lsof)"
      fi
    else
      echo "[Prestart] (skip port check: ss/lsof not available)"
    fi
  elif echo "$PORT" | grep -q '/'; then
    # PORT is path (Unix socket)
    if [ -S "$PORT" ] 2>/dev/null; then
      if command -v lsof >/dev/null 2>&1; then
        if lsof "$PORT" 2>/dev/null | grep -q .; then
          echo "[Prestart] FAIL: Socket $PORT exists and is in use. Stop app in ISPmanager first."
          exit 1
        fi
      elif command -v fuser >/dev/null 2>&1; then
        if fuser "$PORT" 2>/dev/null | grep -q .; then
          echo "[Prestart] FAIL: Socket $PORT in use. Stop app in ISPmanager first."
          exit 1
        fi
      fi
      echo "[Prestart] ✓ Socket $PORT exists but not in use (or cannot check)"
    else
      echo "[Prestart] ✓ Socket path $PORT (file not yet created)"
    fi
  fi
else
  echo "[Prestart] (PORT not set, skip conflict check)"
fi

echo "[Prestart] All checks passed ✓"
exit 0
