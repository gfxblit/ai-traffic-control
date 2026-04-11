import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = 1112;
const BASE_URL = `http://localhost:${PORT}`;

test('API Sessions Endpoints', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atc-api-test-'));
  const runtimeDir = path.join(tempDir, 'runtime');
  const stateDir = path.join(tempDir, 'state');
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  process.env.DASHBOARD_PORT = PORT.toString();
  process.env.SESSIONS_RUNTIME_DIR = runtimeDir;
  process.env.SESSIONS_STATE_FILE = path.join(stateDir, 'sessions-state.json');
  process.env.SESSIONS_FILE = path.join(tempDir, 'sessions.json');
  process.env.ENABLE_TMUX_BACKEND = '0';
  process.env.DASHBOARD_TEST_IMPORT = '1';

  fs.writeFileSync(process.env.SESSIONS_FILE, JSON.stringify([
    { name: 'test-session', publicPort: 8080, backendPort: 8081 }
  ]));

  const { server } = await import('../../server.mjs');
  
  await new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => {
      resolve();
    });
  });

  await t.test('GET /api/sessions/events returns 404 for non-existent session', async () => {
    const res = await fetch(`${BASE_URL}/api/sessions/events?name=unknown`);
    assert.strictEqual(res.statusCode, 404);
  });

  await t.test('GET /api/sessions/events returns events for existent session', async () => {
    const slotDir = path.join(runtimeDir, 'slots', 'test-session', 'current');
    fs.mkdirSync(slotDir, { recursive: true });
    const eventsFile = path.join(slotDir, 'events.jsonl');
    const event = { ts: new Date().toISOString(), eventType: 'UserPromptSubmit', payload: { value: 'hello' } };
    fs.writeFileSync(eventsFile, JSON.stringify(event) + '\n');

    const res = await fetch(`${BASE_URL}/api/sessions/events?name=test-session`);
    assert.strictEqual(res.statusCode, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));
    assert.strictEqual(data.length, 1);
    assert.strictEqual(data[0].eventType, 'UserPromptSubmit');
  });

  await t.test('POST /api/sessions/clear clears events and metadata', async () => {
    const slotDir = path.join(runtimeDir, 'slots', 'test-session', 'current');
    const eventsFile = path.join(slotDir, 'events.jsonl');
    const metaFile = path.join(slotDir, 'meta.json');
    const derivedFile = path.join(slotDir, 'derived.json');

    fs.writeFileSync(eventsFile, JSON.stringify({ ts: new Date().toISOString(), eventType: 'UserPromptSubmit' }) + '\n');
    fs.writeFileSync(metaFile, JSON.stringify({ eventCount: 1, userPromptCount: 1, lastCommand: 'ls' }));
    fs.writeFileSync(derivedFile, JSON.stringify({ eventCount: 1, lastCommand: 'ls' }));

    const res = await fetch(`${BASE_URL}/api/sessions/clear`, {
      method: 'POST',
      body: JSON.stringify({ name: 'test-session' }),
      headers: { 'Content-Type': 'application/json' }
    });
    assert.strictEqual(res.statusCode, 200);

    const events = fs.readFileSync(eventsFile, 'utf8');
    assert.strictEqual(events.trim(), '');

    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    assert.strictEqual(meta.eventCount, 0);
    assert.strictEqual(meta.userPromptCount, 0);
    assert.ok(!meta.lastCommand);

    const derived = JSON.parse(fs.readFileSync(derivedFile, 'utf8'));
    assert.strictEqual(derived.eventCount, 0);
    assert.ok(!derived.lastCommand);
  });

  await t.test('POST /api/sessions/input returns 400 for missing name or text', async () => {
    const res = await fetch(`${BASE_URL}/api/sessions/input`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' }
    });
    assert.strictEqual(res.statusCode, 400);
  });

  await t.test('POST /api/sessions/input returns 200 for valid input', async () => {
    const res = await fetch(`${BASE_URL}/api/sessions/input`, {
      method: 'POST',
      body: JSON.stringify({ name: 'test-session', text: 'ls\n' }),
      headers: { 'Content-Type': 'application/json' }
    });
    assert.strictEqual(res.statusCode, 200);
    const data = await res.json();
    assert.ok(data.ok);
  });

  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        res.json = async () => {
          try { return JSON.parse(data); } catch { return {}; }
        };
        resolve(res);
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}
