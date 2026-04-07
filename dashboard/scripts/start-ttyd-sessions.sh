#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SESSIONS_FILE="${SESSIONS_FILE:-$ROOT_DIR/sessions.json}"
STATE_FILE="${SESSIONS_STATE_FILE:-$ROOT_DIR/state/sessions-state.json}"
RUN_DIR="$ROOT_DIR/run"
NGINX_PREFIX="$RUN_DIR/nginx"
NGINX_CONF="$RUN_DIR/nginx-sessions.conf"
NGINX_BIN="${NGINX_BIN:-/opt/homebrew/opt/nginx/bin/nginx}"
ASSETS_DIR="${ASSETS_DIR:-/Users/nihal/Code/MobileDev/nginx-ttyd}"

mkdir -p "$RUN_DIR" "$NGINX_PREFIX/logs" "$(dirname "$STATE_FILE")"

if ! command -v "$NGINX_BIN" >/dev/null 2>&1; then
  echo "nginx not found at $NGINX_BIN" >&2
  exit 1
fi

if [ ! -f "$SESSIONS_FILE" ]; then
  echo "sessions file not found: $SESSIONS_FILE" >&2
  exit 1
fi

while IFS=$'\t' read -r _name _public_port backend_port _description; do
  pid_file="$RUN_DIR/ttyd-${backend_port}.pid"
  if [ -f "$pid_file" ]; then
    old_pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
      kill "$old_pid" 2>/dev/null || true
      sleep 0.2
      if kill -0 "$old_pid" 2>/dev/null; then
        kill -9 "$old_pid" 2>/dev/null || true
      fi
    fi
    rm -f "$pid_file"
  fi

  port_pid="$(lsof -tiTCP:"$backend_port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$port_pid" ]; then
    kill "$port_pid" 2>/dev/null || true
    sleep 0.2
    if kill -0 "$port_pid" 2>/dev/null; then
      kill -9 "$port_pid" 2>/dev/null || true
    fi
  fi
done < <(node -e '
const fs=require("fs");
const rows=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
for (const row of rows) {
  const name=String(row.name ?? "").trim();
  const pub=Number(row.publicPort);
  const back=Number(row.backendPort);
  if (!name || !Number.isFinite(pub) || !Number.isFinite(back)) continue;
  const desc=String(row.description ?? "").replace(/\t/g, " ");
  console.log(`${name}\t${pub}\t${back}\t${desc}`);
}
' "$SESSIONS_FILE")

node -e '
const fs=require("fs");
const path=require("path");
const sessions=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
const stateFile=process.argv[2];
const out={version:1,updatedAt:new Date().toISOString(),sessions:{}};
for (const s of sessions) {
  const name=String(s.name ?? "").trim();
  if (!name) continue;
  out.sessions[name]={
    name,
    status:"idle",
    taskTitle:`${name} task`,
    workdir:"/Users/nihal/Code/MobileDev",
    agentType:"none",
    spawnedAt:null,
    runId:null,
    firstInteractionAt:null,
    lastInteractionAt:null,
    pid:null,
    lastExitAt:new Date().toISOString(),
    error:null
  };
}
fs.mkdirSync(path.dirname(stateFile), { recursive: true });
fs.writeFileSync(stateFile, JSON.stringify(out, null, 2) + "\n", "utf8");
' "$SESSIONS_FILE" "$STATE_FILE"

cat >"$NGINX_CONF" <<EOF
worker_processes 1;

pid logs/nginx.pid;
error_log logs/error.log info;

events {
  worker_connections 1024;
}

http {
  include /opt/homebrew/etc/nginx/mime.types;
  default_type application/octet-stream;

  access_log logs/access.log;
  sendfile on;
  keepalive_timeout 65;
EOF

while IFS=$'\t' read -r _name public_port backend_port _description; do
  cat >>"$NGINX_CONF" <<EOF
  server {
    listen $public_port;
    server_name _;

    location / {
      proxy_pass http://127.0.0.1:$backend_port;
      proxy_http_version 1.1;
      proxy_set_header Host \$host;
      proxy_set_header Upgrade \$http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Accept-Encoding "";

      sub_filter_once on;
      sub_filter "</body>" '
<link rel="stylesheet" href="/ttyd-mobile.css?v=14" />
<div id="ttyd-mobile-toolbar" aria-label="Terminal mobile controls">
  <div id="ttyd-toolbar-main">
    <button type="button" id="ttyd-btn-ctrlc">Ctrl+C</button>
    <button type="button" id="ttyd-btn-enter">Enter</button>
    <button type="button" id="ttyd-btn-tab" data-input-only="1">Tab</button>
    <button type="button" id="ttyd-btn-up" data-input-only="1">&#8593;</button>
    <button type="button" id="ttyd-btn-down" data-input-only="1">&#8595;</button>
    <button type="button" id="ttyd-btn-esc" data-input-only="1">Esc</button>
    <button type="button" id="ttyd-btn-more" aria-expanded="false">More</button>
  </div>
  <div id="ttyd-toolbar-drawer" hidden>
    <div id="ttyd-drawer-pages">
      <div class="ttyd-drawer-page">
        <button type="button" id="ttyd-btn-wrap">Wrap On</button>
        <button type="button" id="ttyd-btn-font-dec">A-</button>
        <button type="button" id="ttyd-btn-font-inc">A+</button>
      </div>
      <div class="ttyd-drawer-page">
        <button type="button" id="ttyd-btn-esc-alt">Esc</button>
        <button type="button" id="ttyd-btn-tab-alt">Tab</button>
        <button type="button" id="ttyd-btn-up-alt">&#8593;</button>
        <button type="button" id="ttyd-btn-down-alt">&#8595;</button>
      </div>
    </div>
    <div id="ttyd-font-size-label">Font: --px</div>
  </div>
</div>
<script>
  window.TTYD_MOBILE_FLAGS = {
    scrollbar: false,
    history: false,
    touchscroll: false
  };
</script>
<script src="/ttyd-mobile.js?v=13"></script>
</body>';
    }

    location = /ttyd-mobile.css {
      default_type text/css;
      alias $ASSETS_DIR/ttyd-mobile.css;
    }

    location = /ttyd-mobile.js {
      default_type application/javascript;
      alias $ASSETS_DIR/ttyd-mobile.js;
    }
  }

EOF
done < <(node -e '
const fs=require("fs");
const rows=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
for (const row of rows) {
  const name=String(row.name ?? "").trim();
  const pub=Number(row.publicPort);
  const back=Number(row.backendPort);
  if (!name || !Number.isFinite(pub) || !Number.isFinite(back)) continue;
  const desc=String(row.description ?? "").replace(/\t/g, " ");
  console.log(`${name}\t${pub}\t${back}\t${desc}`);
}
' "$SESSIONS_FILE")

cat >>"$NGINX_CONF" <<'EOF'
}
EOF

"$NGINX_BIN" -p "$NGINX_PREFIX/" -c "$NGINX_CONF" -t
if [ -f "$NGINX_PREFIX/logs/nginx.pid" ] && kill -0 "$(cat "$NGINX_PREFIX/logs/nginx.pid")" 2>/dev/null; then
  "$NGINX_BIN" -p "$NGINX_PREFIX/" -c "$NGINX_CONF" -s reload
  echo "reloaded nginx session proxy (700x -> 800x). all scientist slots idle."
else
  "$NGINX_BIN" -p "$NGINX_PREFIX/" -c "$NGINX_CONF"
  echo "started nginx session proxy (700x -> 800x). all scientist slots idle."
fi
