/**
 * Clerk mock server for dev and e2e environments.
 *
 * Exposes:
 *   GET  /.well-known/jwks.json  — JWKS for JWT verification (ClerkAuthAdapter)
 *   POST /sign                   — sign a test JWT { sub, email? }
 *   GET  /health
 *
 * Generates a fresh RSA-2048 key pair on startup (in-memory).
 * The backend's CLERK_JWKS_URL should point here; any JWT signed by /sign
 * will pass ClerkAuthAdapter verification.
 */

import { createServer } from 'http';
import { generateKeyPairSync, createSign, createPublicKey } from 'crypto';

const PORT = parseInt(process.env.PORT || '14803', 10);
const KID = 'mock-key-1';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const pubKeyJwk = createPublicKey(publicKey).export({ format: 'jwk' });
const jwks = { keys: [{ ...pubKeyJwk, use: 'sig', alg: 'RS256', kid: KID }] };

console.log(`[MOCK-CLERK] RSA key pair generated (kid=${KID})`);

function b64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = b64url(createSign('RSA-SHA256').update(data).sign(privateKey));
  return `${data}.${sig}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url, `http://localhost:${PORT}`).pathname;

  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (path === '/.well-known/jwks.json' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(jwks));
    return;
  }

  if (path === '/sign' && req.method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { res.writeHead(400); res.end(JSON.stringify({ error: 'bad json' })); return; }

    const { sub, email } = body;
    if (!sub) { res.writeHead(400); res.end(JSON.stringify({ error: 'sub required' })); return; }

    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({
      sub,
      email: email || `${sub}@findwith.test`,
      iat: now,
      exp: now + 86400,
      iss: `http://localhost:${PORT}`,
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ token }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`[MOCK-CLERK] Listening on :${PORT}`);
});
