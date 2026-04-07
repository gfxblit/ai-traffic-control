#!/usr/bin/env bash
set -euo pipefail

# Keep only the primary mobile path alive: nginx :7680 + ttyd backend :7682.
KEEP_PORTS_REGEX=':(7680|7682)$'

for port in 7681 7683 7684 7685 7686 17777; do
  pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "stopping listeners on :$port ($pids)"
    kill $pids || true
  fi
done

# Stop known tmux helper sessions that are not part of primary path.
for s in ttyd-backend-test ttyd-plain-test mobile-test ttyd-history-server; do
  tmux has-session -t "$s" 2>/dev/null && tmux kill-session -t "$s" || true
done

echo "remaining listeners:" 
lsof -nP -iTCP -sTCP:LISTEN | awk 'NR==1 || /:(7680|7682) /'
