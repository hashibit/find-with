/**
 * DOM fixtures server for e2e tests.
 *
 * Serves static HTML files from the fixtures directory.
 * Used by Playwright to load fake LinkedIn / Gmail pages
 * so content scripts can be tested without hitting real sites.
 */

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '14800', 10);
const FIXTURES_DIR = join(__dirname, 'fixtures');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'text/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const filePath = join(FIXTURES_DIR, url.pathname);

  // Prevent directory traversal outside fixtures dir
  if (!filePath.startsWith(FIXTURES_DIR)) {
    res.writeHead(403);
    res.end();
    return;
  }

  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`Not found: ${url.pathname}`);
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    res.writeHead(500);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`[MOCK-DOM] Listening on :${PORT}, serving ${FIXTURES_DIR}`);
});
