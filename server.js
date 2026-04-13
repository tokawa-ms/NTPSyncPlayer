const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 6413;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
};

const server = http.createServer((req, res) => {
  // パスの正規化（ディレクトリトラバーサル防止）
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, reqPath);
  const resolved = path.resolve(filePath);

  // PUBLIC_DIR 外へのアクセスを拒否
  if (!resolved.startsWith(path.resolve(PUBLIC_DIR))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(resolved, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(resolved).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sync Countdown Server running at http://0.0.0.0:${PORT}`);
  console.log(`LAN内の他マシンからは http://<このマシンのIP>:${PORT} でアクセス`);
});
