import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('enable-codex-hooks.sh should configure Gemini CLI hooks', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-hooks-test-'));
  const fakeHome = path.join(tempDir, 'fake-home');
  fs.mkdirSync(fakeHome);
  
  const codexDir = path.join(fakeHome, '.codex');
  fs.mkdirSync(codexDir);
  fs.writeFileSync(path.join(codexDir, 'config.toml'), '[features]\ncodex_hooks = true\n');

  const geminiDir = path.join(fakeHome, '.gemini');
  const geminiSettings = path.join(geminiDir, 'settings.json');
  fs.mkdirSync(geminiDir);
  fs.writeFileSync(geminiSettings, JSON.stringify({ existing: 'config' }, null, 2));

  const __dirname = path.dirname(new URL(import.meta.url).pathname);
  const scriptPath = path.resolve(__dirname, '../../scripts/enable-codex-hooks.sh');
  
  // Run the script with the fake home directory
  execSync(`env HOME="${fakeHome}" bash "${scriptPath}"`, { stdio: 'pipe' });

  // Read the updated settings
  const updatedSettings = JSON.parse(fs.readFileSync(geminiSettings, 'utf8'));

  assert.ok(updatedSettings.hooks, 'hooks should be defined');
  assert.ok(updatedSettings.hooks.SessionStart, 'SessionStart hook should be defined');
  assert.ok(updatedSettings.hooks.BeforeAgent, 'BeforeAgent hook should be defined');
  assert.ok(updatedSettings.hooks.BeforeTool, 'BeforeTool hook should be defined');
  assert.ok(updatedSettings.hooks.AfterTool, 'AfterTool hook should be defined');
  assert.ok(updatedSettings.hooks.AfterAgent, 'AfterAgent hook should be defined');

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
});
