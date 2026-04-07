#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://127.0.0.1:1111}"
OUT="${2:-dashboard/run/dashboard-mobile.png}"
DEVICE="${DEVICE:-Pixel 7}"

mkdir -p "$(dirname "$OUT")"

if ! npx -y playwright@1.53.0 --version >/dev/null 2>&1; then
  echo "failed to initialize playwright CLI" >&2
  exit 1
fi

npx -y playwright@1.53.0 install chromium >/dev/null 2>&1 || true

npx -y playwright@1.53.0 screenshot \
  --device="$DEVICE" \
  --wait-for-timeout=1500 \
  "$URL" \
  "$OUT"

echo "saved mobile screenshot to $OUT"
