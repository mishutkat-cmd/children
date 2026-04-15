#!/usr/bin/env bash
# Build frontend from web/ and copy to frontend/build/
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WEB_DIR="$PROJECT_ROOT/web"
BUILD_OUTPUT="$PROJECT_ROOT/frontend/build"

echo "=== Building Frontend ==="
echo "Source: $WEB_DIR"
echo "Output: $BUILD_OUTPUT"

# Check source exists
if [ ! -f "$WEB_DIR/package.json" ]; then
  echo "ERROR: $WEB_DIR/package.json not found"
  exit 1
fi

# Detect build tool
cd "$WEB_DIR"
if grep -q '"vite"' package.json 2>/dev/null; then
  BUILD_TOOL="vite"
  # Check if outDir is configured to 'build' in vite.config
  if grep -q "outDir.*build" vite.config.* 2>/dev/null; then
    WEB_BUILD_DIR="$WEB_DIR/build"
  else
    WEB_BUILD_DIR="$WEB_DIR/dist"
  fi
elif grep -q '"react-scripts"' package.json 2>/dev/null; then
  BUILD_TOOL="cra"
  WEB_BUILD_DIR="$WEB_DIR/build"
elif grep -q '"next"' package.json 2>/dev/null; then
  BUILD_TOOL="next"
  WEB_BUILD_DIR="$WEB_DIR/out"
else
  BUILD_TOOL="unknown"
  WEB_BUILD_DIR="$WEB_DIR/dist"
fi

echo "Detected build tool: $BUILD_TOOL"
echo "Expected web build dir: $WEB_BUILD_DIR"

# Install dependencies
echo ""
echo "Installing dependencies..."
npm ci

# Build
echo ""
echo "Building..."
npm run build

# Verify web build
if [ ! -f "$WEB_BUILD_DIR/index.html" ]; then
  echo "ERROR: $WEB_BUILD_DIR/index.html not found after build"
  echo "Checking alternative locations..."
  for alt in "$WEB_DIR/dist" "$WEB_DIR/build" "$WEB_DIR/out"; do
    if [ -f "$alt/index.html" ]; then
      echo "Found: $alt/index.html"
      WEB_BUILD_DIR="$alt"
      break
    fi
  done
fi

if [ ! -f "$WEB_BUILD_DIR/index.html" ]; then
  echo "ERROR: No index.html found after build"
  exit 1
fi

# Clean and copy to frontend/build
echo ""
echo "Copying to $BUILD_OUTPUT..."
rm -rf "$BUILD_OUTPUT"
mkdir -p "$BUILD_OUTPUT"
cp -r "$WEB_BUILD_DIR/"* "$BUILD_OUTPUT/"

# Verify output
echo ""
echo "=== Build Result ==="
if [ -f "$BUILD_OUTPUT/index.html" ]; then
  SIZE=$(wc -c < "$BUILD_OUTPUT/index.html")
  echo "SUCCESS: $BUILD_OUTPUT/index.html exists (${SIZE} bytes)"
  
  # Check for JS references
  if grep -q 'src="' "$BUILD_OUTPUT/index.html"; then
    echo "JS bundles referenced: YES"
  else
    echo "WARNING: No JS references found in index.html"
  fi
  
  # List assets
  echo ""
  echo "Assets:"
  find "$BUILD_OUTPUT" -type f \( -name "*.js" -o -name "*.css" \) | head -5
else
  echo "ERROR: $BUILD_OUTPUT/index.html not found"
  exit 1
fi

echo ""
echo "FRONTEND_BUILD_PATH for .env:"
echo "FRONTEND_BUILD_PATH=$BUILD_OUTPUT"
