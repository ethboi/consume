#!/usr/bin/env bash
# Photographs the /card page of a running site and saves it as the share
# picture for links (Open Graph and X).
#
#   scripts/share-card.sh                       # from http://localhost:3031
#   scripts/share-card.sh http://localhost:3000
#
# Needs Google Chrome or Chromium on the PATH.
set -euo pipefail
base="${1:-http://localhost:3031}"
root="$(cd "$(dirname "$0")/.." && pwd)"
chrome="$(command -v google-chrome || command -v chromium || command -v chromium-browser)"
out="$root/web/src/app/opengraph-image.png"
"$chrome" --headless=new --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 \
  --virtual-time-budget=8000 --screenshot="$out" "$base/card" >/dev/null 2>&1
cp "$out" "$root/web/src/app/twitter-image.png"
echo "saved $out and twitter-image.png"
