import { spawnSlotByName } from './dashboard/server.mjs';

async function test() {
  console.log('Spawning Feynman...');
  try {
    await spawnSlotByName('Feynman', { provider: 'gemini' });
    console.log('Spawn successful');
  } catch (err) {
    console.error('Spawn failed:', err);
  }
}

test();
