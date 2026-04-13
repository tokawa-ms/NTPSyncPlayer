const http = require('http');
const fs = require('fs');
const path = require('path');
const ntpClient = require('ntp-client');

const PORT = process.env.PORT || 6413;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ===== NTP offset cache =====
const NTP_SERVER = 'ntp.nict.jp';
const NTP_PORT = 123;
let ntpOffset = null;        // ms (NTP time - local time)
let ntpLastSync = null;       // Date of last successful sync
let ntpError = null;

function queryNtpOffset() {
  const sendTime = Date.now();
  ntpClient.getNetworkTime(NTP_SERVER, NTP_PORT, (err, date) => {
    const recvTime = Date.now();
    if (err) {
      ntpError = err.message || String(err);
      return;
    }
    // Simple offset: NTP time - midpoint of request
    const rtt = recvTime - sendTime;
    const ntpMs = date.getTime();
    const localMid = sendTime + rtt / 2;
    ntpOffset = ntpMs - localMid;
    ntpLastSync = new Date().toISOString();
    ntpError = null;
  });
}

// Query on startup and every 60 seconds
queryNtpOffset();
setInterval(queryNtpOffset, 60_000);

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
  // ===== NTP offset API =====
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  if (reqUrl.pathname === '/api/ntp-offset') {
    const serverTime = Date.now();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    res.end(JSON.stringify({
      offsetMs: ntpOffset,
      lastSync: ntpLastSync,
      server: NTP_SERVER,
      error: ntpError,
      serverTime: serverTime,
    }));
    return;
  }

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
    const fileSize = stats.size;

    // Range リクエスト対応（スマホブラウザの動画再生に必須）
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (start >= fileSize || end >= fileSize || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
        res.end();
        return;
      }
      const headers206 = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': contentType,
      };
      if (ext === '.html' || ext === '.js' || ext === '.css') {
        headers206['Cache-Control'] = 'no-cache';
      }
      res.writeHead(206, headers206);
      fs.createReadStream(resolved, { start, end }).pipe(res);
    } else {
      const headers200 = {
        'Content-Type': contentType,
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
      };
      if (ext === '.html' || ext === '.js' || ext === '.css') {
        headers200['Cache-Control'] = 'no-cache';
      }
      res.writeHead(200, headers200);
      fs.createReadStream(resolved).pipe(res);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sync Countdown Server running at http://0.0.0.0:${PORT}`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`LAN内の他マシンからは http://<このマシンのIP>:${PORT} でアクセス`);
});
