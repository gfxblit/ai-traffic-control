const http = require('http');
const { execFile } = require('child_process');

const PORT = 17777;
const MAX_LINES = 200000;

function readHistory(session, lines) {
  return new Promise((resolve, reject) => {
    const safeSession = (session || 'mobile').replace(/[^A-Za-z0-9._-]/g, '');
    const n = Math.max(100, Math.min(MAX_LINES, Number(lines) || 20000));
    execFile(
      'tmux',
      ['capture-pane', '-p', '-t', safeSession, '-S', `-${n}`, '-J'],
      { maxBuffer: 50 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
          return;
        }
        resolve(stdout || '');
      }
    );
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  if (u.pathname !== '/history') {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  try {
    const session = u.searchParams.get('session') || 'mobile';
    const lines = u.searchParams.get('lines') || '20000';
    const history = await readHistory(session, lines);
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(history);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`history error: ${e.message}`);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`tmux-history-server listening on 127.0.0.1:${PORT}`);
});
