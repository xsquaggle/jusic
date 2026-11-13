'use strict';
/**
 * Static server for the prototype pages. Serves the repository root on
 * 127.0.0.1 so a prototype can reach shared assets such as public/fonts.
 *   node prototypes/serve.js [port]      then open /prototypes/mercury/
 * Other scripts can start it in-process: require('./serve.js').start(port).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

function handle(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const full = path.resolve(ROOT, '.' + rel);
  if (!full.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

/** Resolves with the listening server, or rejects (for example when the port is already taken). */
function start(port = 5190) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handle);
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { start };

if (require.main === module) {
  const port = Number(process.argv[2]) || 5190;
  start(port).then(() => console.log(`prototypes: http://127.0.0.1:${port}/prototypes/mercury/`));
}
