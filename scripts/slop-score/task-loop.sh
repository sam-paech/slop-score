#!/bin/bash

# Task loop script - runs claude CLI to process tasks until all are complete

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ITERATIONS_DIR="$SCRIPT_DIR/tasks/iterations"

# Create iterations directory if it doesn't exist
mkdir -p "$ITERATIONS_DIR"

while true; do
  # Check if any pending tasks remain
  if ! grep -l '"status": *"pending"' "$SCRIPT_DIR/tasks/"*.json 2>/dev/null | head -1 | grep -q .; then
    echo "All tasks complete"
    exit 0
  fi

  TIMESTAMP=$(date +%s)

  cat "$SCRIPT_DIR/prompt.md" | claude -p \
    --dangerously-skip-permissions \
    --output-format stream-json \
    > "$ITERATIONS_DIR/$TIMESTAMP.jsonl"

  # Add a small delay between iterations
  sleep 1
done
