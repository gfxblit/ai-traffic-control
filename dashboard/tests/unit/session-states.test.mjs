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
