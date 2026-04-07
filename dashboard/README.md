# Dashboard

Runs a lightweight dashboard on port `1111` to show:
- Codex usage (% used in 5-hour and weekly windows + reset times)
- Configured ttyd sessions from `sessions.json` with live active/offline status
- One-click links to open each ttyd session in a new tab

## Start

```bash
# Start mapped ttyd ports (one ttyd per mapped tmux session)
./dashboard/scripts/start-ttyd-sessions.sh

# Start dashboard in tmux on :1111
./dashboard/scripts/start-dashboard.sh
```

Open: `http://<host>:1111`

## Session mapping

Edit `dashboard/sessions.json`:

```json
[
  { "port": 7681, "name": "7681", "description": "tmux session 7681" }
]
```

`name` is the tmux session name and should match the port by convention.
