#!/usr/bin/env bash
set -euo pipefail

# AI Traffic Control Services Reset Script
# This script kills all listeners and tmux sessions, then restarts core services.

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "--- Resetting AI Traffic Control Services ---"

# 1. Kill listeners on known ports
PORTS=(1111 7001 7002 7003 7004 8001 8002 8003 8004 7680 7682)
echo "Stopping listeners on ports: ${PORTS[*]}"
for port in "${PORTS[@]}"; do
  pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "  Killing :$port (PIDs: $pids)"
    kill -9 $pids 2>/dev/null || true
  fi
done

# 2. Kill known tmux sessions
SESSIONS=(dashboard-1111 mobile ttyd-backend ttyd-history-server feynman einstein gauss fermi)
echo "Killing tmux sessions: ${SESSIONS[*]}"
for s in "${SESSIONS[@]}"; do
  if tmux has-session -t "$s" 2>/dev/null; then
    echo "  Killing session: $s"
    tmux kill-session -t "$s" || true
  fi
done

# 3. Restart services
echo "--- Restarting Services ---"

echo "1. Dashboard (Port 1111)..."
bash "$ROOT_DIR/dashboard/scripts/start-dashboard.sh"

echo "2. Scientist TTYD Sessions (700x -> 800x)..."
bash "$ROOT_DIR/dashboard/scripts/start-ttyd-sessions.sh"

echo "3. Standalone Mobile Endpoint (Port 7680)..."
bash "$ROOT_DIR/nginx-ttyd/scripts/start.sh"

echo "--- Services Reset Complete ---"
lsof -nP -iTCP -sTCP:LISTEN | grep -E ":(1111|700|7680)" || true
