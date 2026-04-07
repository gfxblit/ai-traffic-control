#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SESSIONS_FILE="${SESSIONS_FILE:-$ROOT_DIR/sessions.json}"
TMUX_BIN="${TMUX_BIN:-tmux}"
TTYD_BIN="${TTYD_BIN:-/opt/homebrew/bin/ttyd}"

if ! command -v "$TMUX_BIN" >/dev/null 2>&1; then
  echo "tmux not found" >&2
  exit 1
fi

if ! command -v "$TTYD_BIN" >/dev/null 2>&1; then
  echo "ttyd not found at $TTYD_BIN" >&2
  exit 1
fi

if [ ! -f "$SESSIONS_FILE" ]; then
  echo "sessions file not found: $SESSIONS_FILE" >&2
  exit 1
fi

while IFS= read -r line; do
  port="${line%%$'\t'*}"
  name="${line#*$'\t'}"
  backend_session="ttyd-backend-${port}"

  if ! "$TMUX_BIN" has-session -t "$name" 2>/dev/null; then
    "$TMUX_BIN" new-session -d -s "$name"
    echo "created tmux session '$name'"
  fi

  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | grep -q ttyd; then
      echo "ttyd already listening on :$port"
    else
      echo "port :$port already in use by another process, skipping"
    fi
    continue
  fi

  if "$TMUX_BIN" has-session -t "$backend_session" 2>/dev/null; then
    "$TMUX_BIN" kill-session -t "$backend_session"
  fi

  "$TMUX_BIN" new-session -d -s "$backend_session" zsh -lc \
    "\"$TTYD_BIN\" -W -i 0.0.0.0 -p \"$port\" -t scrollback=100000 -t disableResizeOverlay=true -- \"$TMUX_BIN\" attach -t \"$name\""

  echo "started ttyd :$port -> tmux session '$name' (backend $backend_session)"
done < <(node -e '
const fs=require("fs");
const file=process.argv[1];
const arr=JSON.parse(fs.readFileSync(file,"utf8"));
for (const s of arr) {
  const p=Number(s.port);
  if (!Number.isFinite(p) || p<=0) continue;
  const name=String(s.name ?? p);
  console.log(`${p}\t${name}`);
}
' "$SESSIONS_FILE")
