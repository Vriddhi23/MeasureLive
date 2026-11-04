const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.MEASURELIVE_PORT || 4173);
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  if (pathname === '/') { res.writeHead(302, { Location: '/demo/index.html' + new URL(req.url, 'http://localhost').search }).end(); return; }
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) || !['demo', 'extension'].includes(path.relative(root, file).split(path.sep)[0])) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(file)] || 'text/plain';
    res.writeHead(200, { 'Content-Type': type + (type.startsWith('text/') ? '; charset=utf-8' : '') }); res.end(data);
  });
});
server.listen(port, '127.0.0.1', () => console.log(`MeasureLive demo: http://127.0.0.1:${port}`));
