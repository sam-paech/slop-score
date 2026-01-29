#!/bin/bash
set -e

# Navigate to script directory
cd "$(dirname "$0")"

echo "Building slop-score CLI..."

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  bun install
fi

# Run tests first
echo "Running tests..."
bun test

# Bundle all dependencies into single JS file
echo "Bundling..."
bun build ./src/analyze.ts \
  --outfile analyze.js \
  --target bun \
  --minify

# Show result
SIZE=$(du -h analyze.js | cut -f1)
echo ""
echo "Build complete!"
echo "  Output: analyze.js ($SIZE)"
echo ""
echo "Usage:"
echo "  bun scripts/slop-score/analyze.js input.md"
echo "  bun scripts/slop-score/analyze.js input.md --all"
echo "  bun scripts/slop-score/analyze.js input.md --format markdown"
