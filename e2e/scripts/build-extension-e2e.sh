#!/usr/bin/env bash
# Build the e2e variant of the Chrome extension.
#
# Produces: extension/dist-e2e/
# Differences from the production build:
#   - manifest patched with e2e/manifest.e2e.json fields (key, host_permissions, content_scripts, externally_connectable)
#   - VITE_API_BASE=http://localhost:14667 (matches backend e2e port)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
E2E_DIR="$REPO_ROOT/e2e"
EXT_DIR="$REPO_ROOT/extension"
DIST_E2E="$EXT_DIR/dist-e2e"

echo "[build-extension-e2e] Building extension..."

cd "$EXT_DIR"

# Build with e2e API base
VITE_API_BASE=http://localhost:14667 \
  pnpm exec vite build --outDir dist-e2e --emptyOutDir

# Patch manifest
node - <<'EOF'
const fs = require('fs');
const path = require('path');

const baseManifest = JSON.parse(fs.readFileSync(path.join(process.env.EXT_DIR, 'manifest.json'), 'utf8'));
const patch = JSON.parse(fs.readFileSync(path.join(process.env.E2E_DIR, 'manifest.e2e.json'), 'utf8'));

// Deep merge patch into base manifest
const merged = { ...baseManifest, ...patch };

// Fix side_panel path for vite output structure
if (merged.side_panel) {
  merged.side_panel.default_path = 'src/sidepanel/index.html';
}

fs.writeFileSync(
  path.join(process.env.DIST_E2E, 'manifest.json'),
  JSON.stringify(merged, null, 2),
);
console.log('[build-extension-e2e] manifest.json patched');
EOF

echo "[build-extension-e2e] Done → $DIST_E2E"
