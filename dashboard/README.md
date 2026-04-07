# Dashboard

Runs a lightweight dashboard on port `1111` to show:
- Codex usage (% used in 5-hour and weekly windows + reset times)
- Configured ttyd sessions from `sessions.json` with live active/offline status
- One-click links to open each ttyd session in a new tab

## Start

```bash
# Start mapped ttyd ports (public 700x proxied by nginx to ttyd backends on 800x)
./dashboard/scripts/start-ttyd-sessions.sh

# Start dashboard in tmux on :1111
./dashboard/scripts/start-dashboard.sh
```

Open: `http://<host>:1111`

## Session mapping

Edit `dashboard/sessions.json`:

```json
[
  { "name": "Feynman", "publicPort": 7001, "backendPort": 8001, "description": "Feynman session" }
]
```

`publicPort` is what you open on phone. `backendPort` is the local ttyd backend port proxied by nginx.
