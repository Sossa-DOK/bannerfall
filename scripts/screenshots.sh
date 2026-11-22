#!/usr/bin/env bash
# Render itch.io / store screenshots (1280x720) with headless Firefox.
# Needs the dev server running (npm run dev).   Usage: npm run screenshots
set -euo pipefail
OUT="$(pwd)/marketing/screenshots"
PROFILE="${TMPDIR:-/tmp}/bannerfall-ff"
mkdir -p "$OUT" "$PROFILE"
BASE="${BASE_URL:-http://localhost:5173/}"
shot() { # name query
  firefox --headless --no-remote --profile "$PROFILE" --window-size=1280,720 \
    --screenshot "$OUT/$1.png" "${BASE}?shot&$2" >/dev/null 2>&1
  echo "  $OUT/$1.png"
}
shot 1-clash        "f=union&e=bloomkin&mode=1v1&t=200&seed=36&sel=1"
shot 2-gale-2v2     "f=aerie&e=choir&mode=2v2&t=230&seed=36&gale=1"
shot 3-pollen-card  "f=bloomkin&e=union&mode=1v1&t=170&seed=24&card=pollen"
shot 4-legend       "f=choir&e=aerie&mode=1v1&t=60&seed=2&legend=1"
