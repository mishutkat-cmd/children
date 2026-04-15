#!/bin/bash
# Production verification script
# Checks socket, health endpoints, frontend build
# Usage: ./scripts/verify-prod.sh [domain]

set -e

DOMAIN="${1:-${DOMAIN:-}}"
USER="${USER:-${SUDO_USER:-$(whoami)}}"
HOME_DIR="${HOME:-/home/$USER}"

echo "[Verify] Starting production verification..."
echo "[Verify] Domain: ${DOMAIN:-'not set'}"
echo "[Verify] User: $USER"
echo "[Verify] Home: $HOME_DIR"
echo ""

FAILURES=0

# 1. Check socket
if [ -n "$DOMAIN" ]; then
  SOCKET_PATH="$HOME_DIR/.system/nodejs/$DOMAIN.sock"
  if [ -e "$SOCKET_PATH" ]; then
    echo "[Verify] ✓ Socket found: $SOCKET_PATH"
  else
    echo "[Verify] ✗ Socket not found: $SOCKET_PATH"
    FAILURES=$((FAILURES + 1))
  fi
else
  SOCKETS=$(find "$HOME_DIR/.system/nodejs" -name "*.sock" 2>/dev/null | head -1)
  if [ -n "$SOCKETS" ]; then
    echo "[Verify] ✓ Found socket(s) in $HOME_DIR/.system/nodejs/"
  else
    echo "[Verify] ? No sockets found (may be OK if app not started)"
  fi
fi

# 2. Check health endpoint
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/health}"
echo "[Verify] Checking health endpoint: $HEALTH_URL"

if command -v curl >/dev/null 2>&1; then
  HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "ERROR\n000")
  HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -1)
  BODY=$(echo "$HEALTH_RESPONSE" | head -n -1)

  if [ "$HTTP_CODE" = "200" ]; then
    echo "[Verify] ✓ /health returned 200"
    if echo "$BODY" | grep -q '"ok":true'; then
      echo "[Verify] ✓ Health OK: true"
    else
      echo "[Verify] ⚠ Health OK: false"
      echo "[Verify] Response: $BODY"
    fi
  else
    echo "[Verify] ✗ /health returned $HTTP_CODE"
    echo "[Verify] Response: $BODY"
    FAILURES=$((FAILURES + 1))
  fi
else
  echo "[Verify] ⚠ curl not found, skipping health check"
fi

# 3. Check frontend status
FRONTEND_STATUS_URL="${FRONTEND_STATUS_URL:-http://localhost:3000/_frontend/status}"
echo "[Verify] Checking frontend status: $FRONTEND_STATUS_URL"

if command -v curl >/dev/null 2>&1; then
  FRONTEND_RESPONSE=$(curl -s "$FRONTEND_STATUS_URL" 2>/dev/null || echo "{}")
  
  if echo "$FRONTEND_RESPONSE" | grep -q '"enabled":true'; then
    if echo "$FRONTEND_RESPONSE" | grep -q '"found":true'; then
      BUILD_PATH=$(echo "$FRONTEND_RESPONSE" | grep -o '"buildPath":"[^"]*"' | cut -d'"' -f4 || echo "")
      echo "[Verify] ✓ Frontend enabled and found"
      if [ -n "$BUILD_PATH" ]; then
        echo "[Verify]   Build path: $BUILD_PATH"
        
        # Check index.html exists
        if [ -f "$BUILD_PATH/index.html" ]; then
          echo "[Verify] ✓ index.html exists"
        else
          echo "[Verify] ✗ index.html not found in $BUILD_PATH"
          FAILURES=$((FAILURES + 1))
        fi
      fi
    else
      echo "[Verify] ⚠ Frontend enabled but build not found"
      echo "[Verify] Response: $FRONTEND_RESPONSE"
    fi
  else
    echo "[Verify] ℹ Frontend disabled (OK)"
  fi
fi

# 4. Check Firebase storage health (if endpoint exists)
STORAGE_HEALTH_URL="${STORAGE_HEALTH_URL:-http://localhost:3000/api/v1/storage/health}"
if command -v curl >/dev/null 2>&1; then
  STORAGE_RESPONSE=$(curl -s "$STORAGE_HEALTH_URL" 2>/dev/null || echo "")
  if [ -n "$STORAGE_RESPONSE" ] && [ "$STORAGE_RESPONSE" != "{}" ]; then
    echo "[Verify] Firebase storage health: $STORAGE_RESPONSE"
    if echo "$STORAGE_RESPONSE" | grep -q '"ok":false'; then
      echo "[Verify] ⚠ Firebase storage not OK (check reason)"
    fi
  fi
fi

# Summary
echo ""
if [ $FAILURES -eq 0 ]; then
  echo "[Verify] ✓ All checks passed"
  exit 0
else
  echo "[Verify] ✗ $FAILURES check(s) failed"
  exit 1
fi
