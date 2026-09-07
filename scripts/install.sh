#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "skill-mcp install: Node 20+ is required" >&2
  exit 1
fi

npm install
npm run build
node dist/install-cli.js "$@"
