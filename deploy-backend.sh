#!/usr/bin/env bash
set -euo pipefail

HOST="root@shortbox.de"
REMOTE_BASE="/opt/shortbox/backend"
TS="$(date +%Y%m%d%H%M%S)"
REMOTE_REL="$REMOTE_BASE/releases/$TS"

npm run build

if [[ ! -d "dist" ]]; then
  echo "ERROR: dist/ not found. Did the TypeScript build run?"
  exit 1
fi

# Upload dist + manifests (no node_modules)
ssh "$HOST" "mkdir -p '$REMOTE_REL'"
rsync -av --delete dist/ "$HOST:$REMOTE_REL/dist/"
rsync -av package.json "$HOST:$REMOTE_REL/"
if [[ -f package-lock.json ]]; then rsync -av package-lock.json "$HOST:$REMOTE_REL/"; fi
if [[ -f ecosystem.config.cjs ]]; then rsync -av ecosystem.config.cjs "$HOST:$REMOTE_REL/"; fi

ssh "$HOST" "shortbox-activate-backend '$TS'"

echo "✅ Done. Backend deployed as $TS"
