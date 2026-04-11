#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const writerPath = path.join(__dirname, 'shell-hook-writer.mjs');

function debugLog(msg) {
  try {
    fs.appendFileSync('/tmp/atc-hook-debug.log', `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {}
}

async function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      raw += chunk;
    });
    process.stdin.on('end', () => resolve(raw));
    process.stdin.on('error', (err) => {
      debugLog(`stdin error: ${err.message}`);
      resolve('');
    });
  });
}

function parseJson(raw) {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch {
    return null;
  }
}

function forwardToWriter(raw, eventType) {
  debugLog(`forwarding: slot=${process.env.ATC_SLOT} type=${eventType} provider=${process.env.ATC_PROVIDER}`);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [writerPath], {
      stdio: ['pipe', 'ignore', 'ignore'],
      env: {
        ...process.env,
        ATC_EVENT_TYPE: eventType,
        ATC_PROVIDER: process.env.ATC_PROVIDER || 'gemini',
      },
    });

    child.on('error', (err) => {
      debugLog(`spawn error: ${err.message}`);
      resolve();
    });
    child.on('close', (code) => {
      debugLog(`spawn close: code=${code}`);
      resolve();
    });

    if (raw && raw.length > 0) {
      child.stdin.write(raw);
    }
    child.stdin.end();
  });
}

debugLog(`forwarder start: slot=${process.env.ATC_SLOT} provider=${process.env.ATC_PROVIDER}`);
const raw = await readStdin();
debugLog(`raw stdin length: ${raw.length}`);
const payload = parseJson(raw);
const eventType = payload?.hook_event_name || payload?.hookEventName || process.env.ATC_EVENT_TYPE || 'CodexHook';

await forwardToWriter(raw, eventType);

if (eventType === 'Stop' || eventType === 'AfterAgent') {
  process.stdout.write('{"continue": true}\n');
}
