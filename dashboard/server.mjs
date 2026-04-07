#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.DASHBOARD_PORT || 1111);
const SESSIONS_FILE = process.env.SESSIONS_FILE || path.join(__dirname, 'sessions.json');
const REFRESH_MS = 15000;

let usageCache = { value: null, fetchedAt: 0, pending: null };
const USAGE_TTL_MS = 10000;

function runCommand(cmd, args, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ ok: false, stdout, stderr: `timeout after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += String(d)));
    child.stderr.on('data', (d) => (stderr += String(d)));

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: error.message });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr });
    });
  });
}

function formatCountdown(targetIso) {
  if (!targetIso) return 'n/a';
  const target = new Date(targetIso).getTime();
  if (!Number.isFinite(target)) return 'n/a';
  const diff = target - Date.now();
  if (diff <= 0) return 'reset due';
  const sec = Math.floor(diff / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatLocalTime(iso) {
  if (!iso) return 'n/a';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return 'n/a';
  return dt.toLocaleString();
}

async function getCodexUsage() {
  const now = Date.now();
  if (usageCache.value && now - usageCache.fetchedAt < USAGE_TTL_MS) {
    return usageCache.value;
  }
  if (usageCache.pending) return usageCache.pending;

  usageCache.pending = (async () => {
    const raw = await runCommand('codexbar', ['usage', '--provider', 'codex', '--source', 'cli', '--format', 'json']);
    if (!raw.ok) {
      return {
        provider: 'Codex',
        ok: false,
        error: raw.stderr || 'codexbar usage failed',
      };
    }

    try {
      const parsed = JSON.parse(raw.stdout);
      const root = Array.isArray(parsed) ? parsed[0] : parsed;
      const usage = root?.usage || null;
      const openaiDashboard = root?.openaiDashboard || null;
      const primary = usage?.primary || openaiDashboard?.primaryLimit || null;
      const secondary = usage?.secondary || openaiDashboard?.secondaryLimit || null;
      const accountEmail = usage?.accountEmail || openaiDashboard?.signedInEmail || 'unknown';
      const plan = usage?.loginMethod || openaiDashboard?.accountPlan || root?.source || 'unknown';

      return {
        provider: 'Codex',
        ok: true,
        accountEmail,
        plan,
        fiveHour: primary
          ? {
              usedPercent: Number(primary.usedPercent ?? 0),
              windowMinutes: Number(primary.windowMinutes ?? 300),
              resetsAt: primary.resetsAt || null,
              resetDescription: primary.resetDescription || null,
            }
          : null,
        weekly: secondary
          ? {
              usedPercent: Number(secondary.usedPercent ?? 0),
              windowMinutes: Number(secondary.windowMinutes ?? 10080),
              resetsAt: secondary.resetsAt || null,
              resetDescription: secondary.resetDescription || null,
            }
          : null,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        provider: 'Codex',
        ok: false,
        error: `failed to parse codexbar json: ${error.message}`,
      };
    }
  })();

  const value = await usageCache.pending;
  usageCache = { value, fetchedAt: Date.now(), pending: null };
  return value;
}

async function readSessionsConfig() {
  try {
    const text = await fs.readFile(SESSIONS_FILE, 'utf8');
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((s) => ({
        name: String(s.name ?? s.port ?? ''),
        port: Number(s.port),
        description: s.description ? String(s.description) : '',
      }))
      .filter((s) => Number.isFinite(s.port) && s.port > 0);
  } catch {
    return [];
  }
}

function checkPortOpen(port, host = '127.0.0.1', timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;

    function finish(isOpen) {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(isOpen);
    }

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function getSessionsStatus() {
  const sessions = await readSessionsConfig();
  const withStatus = await Promise.all(
    sessions.map(async (s) => ({
      ...s,
      active: await checkPortOpen(s.port),
    }))
  );
  return withStatus;
}

function json(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function html(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function renderPage() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>AI Usage + TTYD Dashboard</title>
  <style>
    :root {
      --text: #e5e7eb;
      --muted: #94a3b8;
      --good: #15803d;
      --mid: #0369a1;
      --warn: #b91c1c;
      --neutral: #374151;
      --border: #334155;
      --link: #93c5fd;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      background: linear-gradient(180deg, #020617 0%, #0f172a 100%);
      color: var(--text);
      padding: 20px;
    }
    h1 { margin: 0 0 6px; font-size: 24px; }
    .sub { color: var(--muted); margin-bottom: 18px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }
    .card {
      background: rgba(17, 24, 39, 0.95);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
    }
    .title { font-size: 13px; color: var(--muted); margin-bottom: 6px; }
    .value { font-size: 28px; font-weight: 700; line-height: 1.1; }
    .meta { margin-top: 6px; color: #cbd5e1; font-size: 13px; }
    .tone-good { border-left: 5px solid var(--good); }
    .tone-mid { border-left: 5px solid var(--mid); }
    .tone-warn { border-left: 5px solid var(--warn); }
    .tone-neutral { border-left: 5px solid var(--neutral); }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid #1e293b;
    }
    .row:last-child { border-bottom: 0; }
    .name { font-weight: 600; }
    .muted { color: var(--muted); font-size: 12px; }
    .pill {
      display: inline-block;
      font-size: 11px;
      border-radius: 999px;
      padding: 3px 9px;
      border: 1px solid #334155;
      color: #cbd5e1;
    }
    .pill.ok { background: rgba(21,128,61,0.2); border-color: #166534; color: #86efac; }
    .pill.off { background: rgba(127,29,29,0.2); border-color: #7f1d1d; color: #fca5a5; }
    a { color: var(--link); text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>AI Usage + TTYD Dashboard</h1>
  <div class="sub">Port 1111. Refreshes every ${Math.round(REFRESH_MS / 1000)}s.</div>

  <section class="card" style="margin-bottom:12px;">
    <div class="title">Usage (5h + weekly windows)</div>
    <div id="usage-grid" class="grid"></div>
  </section>

  <section class="card">
    <div class="title">TTYD Sessions (port = tmux session name)</div>
    <div id="sessions"></div>
  </section>

  <script>
    function esc(v) {
      return String(v)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function usageCard(title, value, meta, tone) {
      return '<article class="card tone-' + tone + '">' +
        '<div class="title">' + esc(title) + '</div>' +
        '<div class="value">' + esc(value) + '</div>' +
        '<div class="meta">' + esc(meta || '') + '</div>' +
      '</article>';
    }

    function hostForPort(port) {
      return window.location.protocol + '//' + window.location.hostname + ':' + port;
    }

    async function refresh() {
      const [usageResp, sessionsResp] = await Promise.all([
        fetch('/api/usage', { cache: 'no-store' }),
        fetch('/api/sessions', { cache: 'no-store' }),
      ]);

      const usage = await usageResp.json();
      const sessions = await sessionsResp.json();

      const usageGrid = document.getElementById('usage-grid');
      const cards = [];
      const codex = usage.codex;

      if (codex && codex.ok) {
        if (codex.fiveHour) {
          const tone = codex.fiveHour.usedPercent >= 85 ? 'warn' : (codex.fiveHour.usedPercent >= 70 ? 'mid' : 'good');
          cards.push(usageCard('Codex 5h usage', Math.round(codex.fiveHour.usedPercent) + '%',
            'Reset in ' + (codex.fiveHour.resetIn || 'n/a') + ' (' + (codex.fiveHour.resetAtLocal || 'n/a') + ')', tone));
        }
        if (codex.weekly) {
          const tone2 = codex.weekly.usedPercent >= 85 ? 'warn' : (codex.weekly.usedPercent >= 70 ? 'mid' : 'good');
          cards.push(usageCard('Codex weekly usage', Math.round(codex.weekly.usedPercent) + '%',
            'Reset in ' + (codex.weekly.resetIn || 'n/a') + ' (' + (codex.weekly.resetAtLocal || 'n/a') + ')', tone2));
        }
        cards.push(usageCard('Codex account', codex.accountEmail || 'unknown', 'Plan: ' + (codex.plan || 'unknown'), 'neutral'));
      } else {
        cards.push(usageCard('Codex', 'Unavailable', codex?.error || 'No data', 'warn'));
      }

      cards.push(usageCard('Claude', 'Coming soon', 'Will add codexbar claude usage next', 'neutral'));
      cards.push(usageCard('Gemini', 'Coming soon', 'Will add provider integration next', 'neutral'));
      usageGrid.innerHTML = cards.join('');

      const sessionsEl = document.getElementById('sessions');
      sessionsEl.innerHTML = (sessions.sessions || []).map(function(s) {
        var url = hostForPort(s.port);
        return '<div class="row">' +
          '<div>' +
            '<div class="name">Session ' + esc(s.name) + ' <span class="muted">(port ' + esc(s.port) + ')</span></div>' +
            '<div class="muted">' + esc(s.description || '') + '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<span class="pill ' + (s.active ? 'ok' : 'off') + '">' + (s.active ? 'active' : 'offline') + '</span>' +
            '<a target="_blank" rel="noopener noreferrer" href="' + esc(url) + '">Open</a>' +
          '</div>' +
        '</div>';
      }).join('') || '<div class="muted">No sessions configured.</div>';
    }

    refresh();
    setInterval(refresh, ${REFRESH_MS});
  </script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/') {
    html(res, 200, renderPage());
    return;
  }

  if (url.pathname === '/api/usage') {
    const codex = await getCodexUsage();
    const payload = {
      fetchedAt: new Date().toISOString(),
      codex: codex.ok
        ? {
            ...codex,
            fiveHour: codex.fiveHour
              ? {
                  ...codex.fiveHour,
                  resetIn: formatCountdown(codex.fiveHour.resetsAt),
                  resetAtLocal: formatLocalTime(codex.fiveHour.resetsAt),
                }
              : null,
            weekly: codex.weekly
              ? {
                  ...codex.weekly,
                  resetIn: formatCountdown(codex.weekly.resetsAt),
                  resetAtLocal: formatLocalTime(codex.weekly.resetsAt),
                }
              : null,
          }
        : codex,
      claude: { ok: false, note: 'coming soon' },
      gemini: { ok: false, note: 'coming soon' },
    };
    json(res, 200, payload);
    return;
  }

  if (url.pathname === '/api/sessions') {
    const sessions = await getSessionsStatus();
    json(res, 200, { sessions, fetchedAt: new Date().toISOString() });
    return;
  }

  json(res, 404, { error: 'not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`dashboard listening on http://0.0.0.0:${PORT}`);
});
