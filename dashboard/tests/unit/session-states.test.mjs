import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DASHBOARD_TEST_IMPORT = '1';
const { ago, durationSince } = await import('../../server.mjs');

// ---------------------------------------------------------------------------
// Helper: replicates the three-state logic from the client-side sessionCard()
// ---------------------------------------------------------------------------
const FIVE_MIN = 5 * 60 * 1000;

function classifySession(s) {
  const hasBackend = s.status === 'active' && s.backendActive;
  const isSpawning = !!s.spawning;
  const isActive = hasBackend && s.lastInteractionMs != null && s.lastInteractionMs < FIVE_MIN;
  const isIdle = hasBackend && !isActive;
  const isUnborn = !hasBackend && !isSpawning;
  return isSpawning ? 'starting' : (isActive ? 'active' : (isIdle ? 'idle' : 'unborn'));
}

// ---------------------------------------------------------------------------
// Three-state classification
// ---------------------------------------------------------------------------

test('session with backend and recent interaction is active', () => {
  assert.equal(classifySession({
    status: 'active', backendActive: true, lastInteractionMs: 60_000,
  }), 'active');
});

test('session with backend and interaction exactly at 5 min boundary is idle', () => {
  assert.equal(classifySession({
    status: 'active', backendActive: true, lastInteractionMs: FIVE_MIN,
  }), 'idle');
});

test('session with backend and old interaction is idle', () => {
  assert.equal(classifySession({
    status: 'active', backendActive: true, lastInteractionMs: 10 * 60 * 1000,
  }), 'idle');
});

test('session with backend but null lastInteractionMs is idle', () => {
  assert.equal(classifySession({
    status: 'active', backendActive: true, lastInteractionMs: null,
  }), 'idle');
});

test('session without backend and not spawning is unborn', () => {
  assert.equal(classifySession({
    status: 'idle', backendActive: false, lastInteractionMs: null,
  }), 'unborn');
});

test('session that is spawning shows as starting', () => {
  assert.equal(classifySession({
    status: 'idle', backendActive: false, spawning: true, lastInteractionMs: null,
  }), 'starting');
});

test('session with status idle but backend somehow active is idle (no recent interaction)', () => {
  // Edge case: status not yet updated but backend responds
  assert.equal(classifySession({
    status: 'idle', backendActive: true, lastInteractionMs: 600_000,
  }), 'unborn');
});

test('active status without backend is unborn', () => {
  assert.equal(classifySession({
    status: 'active', backendActive: false, lastInteractionMs: 1000,
  }), 'unborn');
});

// ---------------------------------------------------------------------------
// ago() helper
// ---------------------------------------------------------------------------

test('ago returns n/a for falsy input', () => {
  assert.equal(ago(null), 'n/a');
  assert.equal(ago(''), 'n/a');
  assert.equal(ago(undefined), 'n/a');
});

test('ago returns seconds for recent timestamps', () => {
  const now = new Date(Date.now() - 30_000).toISOString(); // 30s ago
  assert.match(ago(now), /^\d+s ago$/);
});

test('ago returns minutes for timestamps a few minutes old', () => {
  const ts = new Date(Date.now() - 3 * 60_000).toISOString(); // 3m ago
  assert.match(ago(ts), /^\d+m ago$/);
});

test('ago returns hours for timestamps hours old', () => {
  const ts = new Date(Date.now() - 2 * 3600_000).toISOString(); // 2h ago
  assert.match(ago(ts), /^\d+h ago$/);
});

test('ago returns days for timestamps days old', () => {
  const ts = new Date(Date.now() - 3 * 86400_000).toISOString(); // 3d ago
  assert.match(ago(ts), /^\d+d ago$/);
});

test('ago returns n/a for invalid ISO string', () => {
  assert.equal(ago('not-a-date'), 'n/a');
});

// ---------------------------------------------------------------------------
// durationSince() helper
// ---------------------------------------------------------------------------

test('durationSince returns n/a for falsy input', () => {
  assert.equal(durationSince(null), 'n/a');
  assert.equal(durationSince(''), 'n/a');
});

test('durationSince returns minutes for short durations', () => {
  const ts = new Date(Date.now() - 15 * 60_000).toISOString(); // 15m ago
  assert.equal(durationSince(ts), '15m');
});

test('durationSince returns hours and minutes for longer durations', () => {
  const ts = new Date(Date.now() - (2 * 3600_000 + 30 * 60_000)).toISOString(); // 2h30m ago
  assert.equal(durationSince(ts), '2h 30m');
});

test('durationSince returns days and hours for multi-day durations', () => {
  const ts = new Date(Date.now() - (1 * 86400_000 + 5 * 3600_000)).toISOString(); // 1d5h ago
  assert.equal(durationSince(ts), '1d 5h');
});

test('durationSince returns n/a for invalid ISO string', () => {
  assert.equal(durationSince('garbage'), 'n/a');
});

// ---------------------------------------------------------------------------
// Tmux pane state parsing (replicates readTmuxSlotPaneState logic)
// ---------------------------------------------------------------------------

function parseTmuxPaneOutput(stdout) {
  const rows = (stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [windowName, paneActive, paneCurrentPath, windowActivity] = line.split('\t');
      return {
        windowName: windowName || '',
        paneActive: paneActive === '1',
        paneCurrentPath: paneCurrentPath || null,
        windowActivity: Number(windowActivity),
      };
    });
  if (rows.length === 0) return null;

  const preferred = rows.find((row) => row.windowName === 'atc') || rows.find((row) => row.paneActive) || rows[0];
  const activityMs = Number.isFinite(preferred.windowActivity) && preferred.windowActivity > 0 ? preferred.windowActivity * 1000 : null;
  return {
    cwd: preferred.paneCurrentPath || null,
    lastInteractionAt: activityMs ? new Date(activityMs).toISOString() : null,
  };
}

test('tmux pane parser extracts window_activity as lastInteractionAt', () => {
  const ts = Math.floor(Date.now() / 1000);
  const stdout = `atc\t1\t/home/user/project\t${ts}`;
  const result = parseTmuxPaneOutput(stdout);
  assert.equal(result.cwd, '/home/user/project');
  assert.equal(result.lastInteractionAt, new Date(ts * 1000).toISOString());
});

test('tmux pane parser returns null lastInteractionAt when activity is 0', () => {
  const stdout = 'atc\t1\t/home/user\t0';
  const result = parseTmuxPaneOutput(stdout);
  assert.equal(result.lastInteractionAt, null);
});

test('tmux pane parser returns null for empty output', () => {
  assert.equal(parseTmuxPaneOutput(''), null);
  assert.equal(parseTmuxPaneOutput(null), null);
});

test('tmux pane parser prefers atc window over other windows', () => {
  const ts1 = Math.floor(Date.now() / 1000) - 600;
  const ts2 = Math.floor(Date.now() / 1000);
  const stdout = `other\t1\t/tmp\t${ts1}\natc\t0\t/home/user\t${ts2}`;
  const result = parseTmuxPaneOutput(stdout);
  assert.equal(result.cwd, '/home/user');
  assert.equal(result.lastInteractionAt, new Date(ts2 * 1000).toISOString());
});

test('tmux pane parser falls back to active pane when no atc window', () => {
  const ts = Math.floor(Date.now() / 1000);
  const stdout = `bash\t0\t/tmp\t${ts - 100}\nzsh\t1\t/home\t${ts}`;
  const result = parseTmuxPaneOutput(stdout);
  assert.equal(result.cwd, '/home');
  assert.equal(result.lastInteractionAt, new Date(ts * 1000).toISOString());
});
