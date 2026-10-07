'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_PATH = (process.env.BASE_PATH || '/paketdienst').replace(/\/$/, '') || '/paketdienst';
const PORT = parseInt(process.env.PORT || '3002', 10);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = path.resolve(
  process.env.FRONTEND_DIST || path.join(__dirname, '..', 'frontend', 'dist'),
);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function safePath(urlPath) {
  const normalized = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const full = path.join(ROOT, normalized);
  if (!full.startsWith(ROOT)) return null;
  return full;
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const headers = { 'Content-Type': type };
  if (path.basename(filePath) === 'sw.js') {
    headers['Cache-Control'] = 'no-cache';
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, 'Not Found');
      return;
    }
    send(res, 200, data, headers);
  });
}

function handler(req, res) {
  const raw = req.url?.split('?')[0] || '/';
  let pathname = decodeURIComponent(raw);

  if (!pathname.startsWith(BASE_PATH)) {
    if (pathname === '/' || pathname === '') {
      send(res, 302, '', { Location: `${BASE_PATH}/` });
      return;
    }
    send(res, 404, 'Not Found');
    return;
  }

  let rel = pathname.slice(BASE_PATH.length);
  if (rel === '' || rel === '/') rel = '/index.html';
  if (rel.endsWith('/')) rel += 'index.html';

  const filePath = safePath(rel);
  if (!filePath) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) {
      serveFile(res, filePath);
      return;
    }
    const indexPath = path.join(ROOT, 'index.html');
    fs.stat(indexPath, (indexErr, indexStat) => {
      if (indexErr || !indexStat.isFile()) {
        send(res, 404, 'Not Found');
        return;
      }
      serveFile(res, indexPath);
    });
  });
}

if (!fs.existsSync(ROOT)) {
  console.error(`Frontend dist fehlt: ${ROOT}`);
  process.exit(1);
}

http.createServer(handler).listen(PORT, HOST, () => {
  console.log(`Static server ${HOST}:${PORT} → ${ROOT} (BASE_PATH=${BASE_PATH})`);
});
