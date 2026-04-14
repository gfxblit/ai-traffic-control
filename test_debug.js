const http = require('http');
const req = http.request({
  hostname: '127.0.0.1',
  port: 1111,
  path: '/api/sessions/spawn',
  method: 'POST',
  headers: {'Content-Type': 'application/json'}
}, (res) => {
  res.on('data', (d) => process.stdout.write(d));
});
req.write(JSON.stringify({name:"Feynman", provider:"gemini", workdir:"/tmp/debug-test", templateId:"new_brainstorm"}));
req.end();
