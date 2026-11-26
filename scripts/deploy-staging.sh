#!/usr/bin/env bash
# Publish this folder to coach-halo-staging.netlify.app only.
# Ships just the signup and partner functions so staging cannot reach the
# events, stories, matching, or Stripe functions (and their production tables).
set -euo pipefail

STAGING_SITE_ID="b0854327-aa0f-491f-bb1e-57c29c255e3d"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ ! -f "$ROOT/netlify.toml" ] || [ ! -f "$ROOT/netlify/functions/coach-join.js" ]; then
  echo "Run this script from the coach-halo-site-migration folder ($ROOT is not the site root)." >&2
  exit 1
fi
OUT="$(mktemp -d /tmp/coach-halo-staging.XXXXXX)"
netlify_cli() {
  if [ -n "${NETLIFY_BIN:-}" ]; then "$NETLIFY_BIN" "$@"; else npx --yes netlify "$@"; fi
}

# $OUT/site is published; functions and node_modules sit beside it, not inside it.
SITE="$OUT/site"
mkdir -p "$SITE"
rsync -a \
  --exclude .git --exclude .netlify --exclude node_modules --exclude scripts \
  --exclude netlify --exclude 'stories/' --exclude 'package*.json' \
  "$ROOT/" "$SITE/"

mkdir -p "$OUT/netlify/functions"
for fn in coach-join.js coach-signup-lib.js signup-guard.js partner-submit.js partner-activation.js partner-lib.js; do
  if [ -f "$ROOT/netlify/functions/$fn" ]; then cp "$ROOT/netlify/functions/$fn" "$OUT/netlify/functions/"; fi
done
cp -R "$ROOT/node_modules" "$OUT/node_modules"
cp "$ROOT/package.json" "$OUT/package.json"
sed 's|^  publish = "."|  publish = "site"|' "$ROOT/netlify.toml" > "$OUT/netlify.toml"

printf '/*\n  X-Robots-Tag: noindex, nofollow\n' > "$SITE/_headers"

cd "$OUT"
netlify_cli deploy --prod --site "$STAGING_SITE_ID" --dir "$SITE" --functions "$OUT/netlify/functions" \
  --message "staging: ${1:-affiliate migration}"
echo "Staging deploy dir: $OUT"
