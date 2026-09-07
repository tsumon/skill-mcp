#!/usr/bin/env bash
# Optional single-file binary via bun compile. Fallback: node dist/index.js
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="${1:-dist-pack}"
mkdir -p "$OUT"

if ! command -v bun >/dev/null 2>&1; then
  echo "skill-mcp pack: bun not found" >&2
  echo "fallback: npm run build && node dist/index.js" >&2
  exit 1
fi

bun build --compile src/index.ts --outfile "$OUT/skill-mcp"
bun build --compile src/cli-main.ts --outfile "$OUT/skill-mcp-cli"
echo "wrote $OUT/skill-mcp"
echo "wrote $OUT/skill-mcp-cli"
echo "host wiring: set mcp args to the absolute path of $OUT/skill-mcp"
