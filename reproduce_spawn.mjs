import http from 'node:http';

async function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          res.json = JSON.parse(data);
        } catch (e) {
          res.json = { error: 'failed to parse json', raw: data };
        }
        resolve(res);
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const PORT = 1111;
  const BASE_URL = `http://localhost:${PORT}`;

  console.log('--- Checking Initial Status ---');
  const initRes = await request(`${BASE_URL}/api/sessions`);
  console.log('Initial Feynman:', JSON.stringify((initRes.json.sessions || []).find(s => s.name === 'Feynman'), null, 2));

  console.log('\n--- Spawning Feynman ---');
  const spawnRes = await request(`${BASE_URL}/api/sessions/spawn`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Feynman', provider: 'gemini' }),
    headers: { 'Content-Type': 'application/json' }
  });
  console.log('Spawn Response:', spawnRes.statusCode, spawnRes.json);

  console.log('\n--- Polling Status ---');
  for (let i = 0; i < 10; i++) {
    const res = await request(`${BASE_URL}/api/sessions`);
    const sessions = res.json.sessions || [];
    const feynman = sessions.find(s => s.name === 'Feynman');
    
    if (feynman) {
      console.log(`[T+${i}s] Status: ${feynman.status}, BackendActive: ${feynman.backendActive}, SpawnedAt: ${feynman.spawnedAt}`);
      if (feynman.status === 'active' && feynman.backendActive) {
         console.log('SUCCESS: Feynman is active and backend is responsive!');
         break;
      }
    } else {
      console.log(`[T+${i}s] Feynman not found`);
    }
    
    await sleep(1000);
  }

  console.log('\n--- Step 3: Sending Input ---');
  const inputRes = await request(`${BASE_URL}/api/sessions/input`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Feynman', text: 'hello' }),
    headers: { 'Content-Type': 'application/json' }
  });
  console.log('Input Response:', inputRes.statusCode, inputRes.json);
}

run().catch(console.error);
