import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = 1113 + Math.floor(Math.random() * 1000);
const BACKEND_PORT = 18001 + Math.floor(Math.random() * 1000);
const BASE_URL = `http://localhost:${PORT}`;

test('API Agents Spawn Endpoint', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atc-agent-test-'));
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
    { name: 'TestScientist', publicPort: PORT + 1, backendPort: BACKEND_PORT }
  ]));

  const { server } = await import('../../server.mjs?test=' + Date.now());
  
  await new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => {
      resolve();
    });
  });

  await t.test('POST /api/agents/spawn with workdir', async () => {
    // Create a dummy workdir
    const testWorkdir = path.join(tempDir, 'test-workdir');
    fs.mkdirSync(testWorkdir, { recursive: true });

    const res = await fetch(`${BASE_URL}/api/agents/spawn`, {
      method: 'POST',
      body: JSON.stringify({ 
        dialId: 'calendar_manager', 
        provider: 'gemini',
        workdir: testWorkdir
      }),
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await res.json();
    if (res.statusCode !== 200 && data.error !== 'ttyd backend ' + BACKEND_PORT + ' did not become ready in time') {
      console.log('DEBUG: API error:', data.error);
    }
    
    const stateRaw = fs.readFileSync(process.env.SESSIONS_STATE_FILE, 'utf8');
    const state = JSON.parse(stateRaw);
    assert.strictEqual(state.sessions['TestScientist'].workdir, testWorkdir);
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
