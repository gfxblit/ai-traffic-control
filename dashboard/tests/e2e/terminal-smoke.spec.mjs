import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DASHBOARD_PORT = 19111;
const BACKEND_PORT = 18101;
const PUBLIC_PORT = 17101;

let tmpRoot;
let workdir;
let sessionsFile;
let stateFile;
let runDir;
let runtimeDir;
let dashboardProc;
let eventsFile;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DASHBOARD_ROOT = path.resolve(__dirname, '../..');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readEvents(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function waitFor(fn, timeoutMs = 12000, stepMs = 200) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (err) {
      lastErr = err;
    }
    await sleep(stepMs);
  }
  if (lastErr) throw lastErr;
  throw new Error('waitFor timeout');
}

async function api(pathname, method = 'GET', payload = undefined) {
  const response = await fetch(`http://127.0.0.1:${DASHBOARD_PORT}${pathname}`, {
    method,
    headers: payload ? { 'content-type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${pathname} failed: ${response.status} ${body.error || ''}`.trim());
  }
  return body;
}

test.beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'atc-e2e-'));
  workdir = path.join(tmpRoot, 'workdir');
  sessionsFile = path.join(tmpRoot, 'sessions.json');
  stateFile = path.join(tmpRoot, 'state', 'sessions-state.json');
  runDir = path.join(tmpRoot, 'run');
  runtimeDir = path.join(tmpRoot, 'runtime');
  eventsFile = path.join(runtimeDir, 'slots', 'feynman', 'current', 'events.jsonl');

  await fs.mkdir(workdir, { recursive: true });
  await fs.mkdir(path.dirname(stateFile), { recursive: true });

  const sessions = [
    {
      name: 'Feynman',
      publicPort: PUBLIC_PORT,
      backendPort: BACKEND_PORT,
      description: 'test slot',
    },
  ];
  await fs.writeFile(sessionsFile, JSON.stringify(sessions, null, 2) + '\n', 'utf8');

  dashboardProc = spawn(process.execPath, ['server.mjs'], {
    cwd: DASHBOARD_ROOT,
    env: {
      ...process.env,
      DASHBOARD_PORT: String(DASHBOARD_PORT),
      SESSIONS_FILE: sessionsFile,
      SESSIONS_STATE_FILE: stateFile,
      SESSIONS_RUN_DIR: runDir,
      SESSIONS_RUNTIME_DIR: runtimeDir,
      DEFAULT_SESSION_WORKDIR: workdir,
      ENABLE_SHELL_HOOKS: '1',
      TELEMETRY_INGEST_MS: '500',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  dashboardProc.stdout.on('data', () => {});
  dashboardProc.stderr.on('data', () => {});

  await waitFor(async () => {
    const res = await fetch(`http://127.0.0.1:${DASHBOARD_PORT}/api/sessions`);
    return res.ok;
  }, 15000);
});

test.afterAll(async () => {
  try {
    await api('/api/sessions/kill', 'POST', { name: 'Feynman' });
  } catch {
    // Ignore cleanup failures.
  }

  if (dashboardProc && !dashboardProc.killed) {
    dashboardProc.kill('SIGTERM');
    await sleep(500);
    if (dashboardProc.exitCode === null) {
      dashboardProc.kill('SIGKILL');
    }
  }

  if (tmpRoot) {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('shell hooks emit full telemetry and dashboard exposes derived metadata', async ({ page }) => {
  const markerFile = path.join(workdir, `terminal-smoke-${Date.now()}.txt`);
  const subdir = path.join(workdir, 'hook-cwd');
  const pwdFile = path.join(workdir, `hook-pwd-${Date.now()}.txt`);

  await api('/api/sessions/spawn', 'POST', { name: 'Feynman' });

  await waitFor(async () => {
    const sessions = await api('/api/sessions');
    const slot = sessions.sessions.find((s) => s.name === 'Feynman');
    return slot && slot.backendActive;
  }, 12000);

  await page.goto(`http://127.0.0.1:${BACKEND_PORT}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.xterm', { timeout: 15000 });

  await expect
    .poll(async () => {
      try {
        const rows = await readEvents(eventsFile);
        return rows.some((row) => row.eventType === 'shell_start');
      } catch {
        return false;
      }
    }, {
      timeout: 10000,
      message: 'expected shell_start hook event before typing commands',
    })
    .toBe(true);

  // Focus terminal and execute a command purely through keystrokes.
  await page.locator('.xterm').click({ position: { x: 120, y: 120 } });
  await page.keyboard.type(`mkdir -p ${subdir}`, { delay: 12 });
  await page.keyboard.press('Enter');
  await page.keyboard.type(`cd ${subdir}`, { delay: 12 });
  await page.keyboard.press('Enter');
  await page.keyboard.type(`pwd > ${pwdFile}`, { delay: 12 });
  await page.keyboard.press('Enter');
  await page.keyboard.type(`printf 'atc-terminal-e2e-ok\\n' > ${markerFile}`, { delay: 12 });
  await page.keyboard.press('Enter');

  await expect
    .poll(async () => {
      try {
        const text = await fs.readFile(markerFile, 'utf8');
        return text.trim();
      } catch {
        return '';
      }
    }, {
      timeout: 10000,
      message: `expected terminal command to create ${markerFile}`,
    })
    .toBe('atc-terminal-e2e-ok');

  await expect
    .poll(async () => {
      try {
        const rows = await readEvents(eventsFile);
        const hasPreexec = rows.some((row) => row.eventType === 'preexec' && typeof row.command === 'string' && row.command.includes(markerFile));
        const hasPrecmd = rows.some((row) => row.eventType === 'precmd');
        const hasChpwd = rows.some(
          (row) => row.eventType === 'chpwd' && typeof row.cwd === 'string' && (row.cwd === subdir || row.cwd.endsWith('/hook-cwd'))
        );
        return hasPreexec && hasPrecmd && hasChpwd;
      } catch {
        return false;
      }
    }, {
      timeout: 10000,
      message: 'expected shell hooks to record preexec/precmd/chpwd events',
    })
    .toBe(true);

  await expect
    .poll(async () => {
      try {
        const text = await fs.readFile(pwdFile, 'utf8');
        return text.trim();
      } catch {
        return '';
      }
    }, {
      timeout: 10000,
      message: `expected pwd output to be written to ${pwdFile}`,
    })
    .toBe(subdir);

  await expect
    .poll(async () => {
      const payload = await api('/api/sessions');
      const slot = payload.sessions.find((s) => s.name === 'Feynman');
      if (!slot?.telemetry) return null;
      return {
        cwd: slot.workdir,
        activeSince: slot.activeSince,
        lastInteractionAgo: slot.lastInteractionAgo,
        lastEventType: slot.telemetry.lastEventType,
        lastCommand: slot.telemetry.lastCommand,
        durationMs: slot.telemetry.durationMs,
      };
    }, {
      timeout: 12000,
      message: 'expected dashboard session API to expose derived shell telemetry',
    })
    .toMatchObject({
      cwd: subdir,
      activeSince: expect.any(String),
      lastEventType: 'precmd',
      lastCommand: expect.stringContaining(markerFile),
      lastInteractionAgo: expect.stringMatching(/ago$/),
    });

  await expect
    .poll(async () => {
      const payload = await api('/api/sessions');
      const slot = payload.sessions.find((s) => s.name === 'Feynman');
      return Number(slot?.telemetry?.durationMs);
    }, {
      timeout: 12000,
      message: 'expected numeric command duration in derived telemetry',
    })
    .toBeGreaterThanOrEqual(0);

  await api('/api/sessions/kill', 'POST', { name: 'Feynman' });
});
