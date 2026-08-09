/**
 * Complete Clerk Frontend API (FAPI) mock server for dev and e2e.
 *
 * Simulates all endpoints that Clerk SDK (@clerk/nextjs, @clerk/clerk-js) needs:
 *   GET  /v1/client                     — Client state (session, user)
 *   POST /v1/client                     — Create client
 *   GET  /v1/sessions                   — List sessions
 *   GET  /v1/sessions/:id               — Get session
 *   POST /v1/sessions/:id/tokens        — Create session token
 *   DELETE /v1/sessions/:id             — Delete session (sign out)
 *   GET  /v1/users                      — List users
 *   GET  /v1/users/:id                  — Get user
 *   POST /v1/users                      — Create user (sign_up)
 *   PATCH /v1/users/:id                 — Update user
 *   POST /v1/sign_ins                   — Sign in flow
 *   POST /v1/sign_ins/:id/prepare       — Prepare sign-in factor
 *   POST /v1/sign_ins/:id/attempt       — Attempt sign-in
 *   POST /v1/sign_ups                   — Sign up flow
 *   POST /v1/sign_ups/:id/prepare       — Prepare sign-up factor
 *   POST /v1/sign_ups/:id/attempt       — Attempt sign-up
 *   GET  /.well-known/jwks.json         — JWKS for JWT verification
 *   POST /sign                          — Dev-only: sign test JWT
 *   GET  /health
 *
 * Generates RSA-2048 key pair on startup. All JWTs signed by this key.
 */

import { createServer } from 'http';
import { generateKeyPairSync, createSign, createPublicKey, randomUUID } from 'crypto';

const PORT = parseInt(process.env.PORT || '14611', 10);
const KID = 'mock-key-1';
const ISSUER = `http://localhost:${PORT}`;

// Generate RSA key pair
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const pubKeyJwk = createPublicKey(publicKey).export({ format: 'jwk' });
const jwks = { keys: [{ ...pubKeyJwk, use: 'sig', alg: 'RS256', kid: KID }] };

// In-memory stores
const users = new Map();
const sessions = new Map();
const clients = new Map();
const signIns = new Map();
const signUps = new Map();

// Dev bootstrap: create a default test user and session
const DEV_USER_ID = 'user_dev_001';
const DEV_SESSION_ID = 'sess_dev_001';
const DEV_CLIENT_ID = 'client_dev_001';

users.set(DEV_USER_ID, {
  id: DEV_USER_ID,
  object: 'user',
  username: 'devuser',
  first_name: 'Dev',
  last_name: 'User',
  email_addresses: [
    { id: 'email_dev_001', email_address: 'dev@findwith.local', verification: { status: 'verified' }, linked_to: [] },
  ],
  phone_numbers: [],
  primary_email_address_id: 'email_dev_001',
  primary_phone_number_id: null,
  image_url: `https://ui-avatars.com/api/?name=Dev+User&background=6366f1&color=fff`,
  created_at: Date.now(),
  updated_at: Date.now(),
  last_sign_in_at: Date.now(),
  public_metadata: {},
  private_metadata: {},
  unsafe_metadata: {},
  external_accounts: [],
  saml_accounts: [],
  totp_enabled: false,
  two_factor_enabled: false,
  password_enabled: true,
  password_updated_at: Date.now(),
  profile_image_url: '',
});

sessions.set(DEV_SESSION_ID, {
  id: DEV_SESSION_ID,
  object: 'session',
  status: 'active',
  user_id: DEV_USER_ID,
  client_id: DEV_CLIENT_ID,
  abandon_at: Date.now() + 86400000 * 30,
  expire_at: Date.now() + 86400000,
  last_active_at: Date.now(),
  last_active_organization_id: null,
  created_at: Date.now(),
  updated_at: Date.now(),
  actor: null,
});

clients.set(DEV_CLIENT_ID, {
  id: DEV_CLIENT_ID,
  object: 'client',
  sessions: [sessions.get(DEV_SESSION_ID)],
  created_at: Date.now(),
  updated_at: Date.now(),
  last_active_session_id: DEV_SESSION_ID,
});

console.log(`[MOCK-CLERK] RSA key pair generated (kid=${KID})`);
console.log(`[MOCK-CLERK] Dev user created: ${DEV_USER_ID}`);
console.log(`[MOCK-CLERK] Dev session created: ${DEV_SESSION_ID}`);

// Helper functions
function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = b64url(createSign('RSA-SHA256').update(data).sign(privateKey));
  return `${data}.${sig}`;
}

function generateId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, data, cookies) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookies) {
    headers['Set-Cookie'] = Array.isArray(cookies)
      ? cookies
      : Object.entries(cookies).map(([k, v]) => `${k}=${v}`);
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

function parsePath(url) {
  const path = new URL(url, `http://localhost:${PORT}`).pathname;
  const parts = path.split('/').filter(Boolean);
  return { path, parts };
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

function getSessionFromCookie(req) {
  const cookies = parseCookies(req);
  const sid = cookies.__session;
  if (!sid) return null;
  return sessions.get(sid) || null;
}

const COOKIE_OPTS = 'HttpOnly; SameSite=Lax; Path=/';

// Create session token for a session
function createSessionToken(sessionId, userId) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({
    sub: userId,
    sid: sessionId,
    iat: now,
    exp: now + 60,
    iss: ISSUER,
    azp: 'http://localhost:14606',
  });
}

// Main request handler
const server = createServer(async (req, res) => {
  const { path, parts } = parsePath(req.url);
  const method = req.method;

  console.log(`[MOCK-CLERK] ${method} ${path}`);

  // CORS headers for browser requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, __client');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (path === '/health') {
    return sendJson(res, 200, { ok: true });
  }

  // JWKS
  if (path === '/.well-known/jwks.json' && method === 'GET') {
    return sendJson(res, 200, jwks);
  }

  // Dev-only: sign arbitrary JWT — cookie-authenticated or explicit sub
  if (path === '/sign' && method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { body = {}; }

    // Prefer cookie-based session
    const session = getSessionFromCookie(req);
    if (session) {
      const user = users.get(session.user_id);
      const now = Math.floor(Date.now() / 1000);
      const token = signJwt({
        sub: session.user_id,
        email: user?.email_addresses?.[0]?.email_address || `${session.user_id}@findwith.test`,
        iat: now,
        exp: now + 86400,
        iss: ISSUER,
      });
      return sendJson(res, 200, { token });
    }

    // Fallback: explicit sub (for backend tests calling mock-clerk directly)
    const { sub, email } = body;
    if (!sub) { return sendJson(res, 400, { error: 'sub required when no session cookie' }); }

    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({
      sub,
      email: email || `${sub}@findwith.test`,
      iat: now,
      exp: now + 86400,
      iss: ISSUER,
    });
    return sendJson(res, 200, { token });
  }

  // /v1/client - Get or create client
  if (path === '/v1/client') {
    // Check for __client header or cookie (session token)
    const clientToken = req.headers['__client'] || req.headers['authorization']?.replace('Bearer ', '');

    if (method === 'GET') {
      // Read __session cookie to find the active session
      const session = getSessionFromCookie(req);
      const client = clients.get(DEV_CLIENT_ID);

      if (session) {
        const user = users.get(session.user_id);
        const newToken = createSessionToken(session.id, session.user_id);

        return sendJson(res, 200, {
          response: {
            ...client,
            sessions: [{ ...session, user, token: newToken }],
          },
          client: {
            ...client,
            sessions: [{ ...session, user }],
          },
          session: { ...session, user },
          user,
          token: newToken,
          publishable_key: 'pk_test_mock_001',
        });
      }

      // No cookie — return client with no sessions (unauthenticated)
      return sendJson(res, 200, {
        response: { ...client, sessions: [] },
        client: { ...client, sessions: [] },
        session: null,
        user: null,
        token: null,
        publishable_key: 'pk_test_mock_001',
      });
    }

    if (method === 'POST') {
      let body;
      try { body = JSON.parse(await readBody(req)); }
      catch { return sendJson(res, 400, { error: 'bad json' }); }

      const clientId = generateId('client');
      const client = {
        id: clientId,
        object: 'client',
        sessions: [],
        created_at: Date.now(),
        updated_at: Date.now(),
        last_active_session_id: null,
      };
      clients.set(clientId, client);

      return sendJson(res, 200, {
        response: client,
        client: client,
      });
    }
  }

  // /v1/sessions - List sessions
  if (path === '/v1/sessions' && method === 'GET') {
    const sessionList = Array.from(sessions.values()).map(s => ({
      ...s,
      user: users.get(s.user_id),
    }));
    return sendJson(res, 200, { data: sessionList, total_count: sessionList.length });
  }

  // /v1/sessions/:id - Get/Delete session
  if (parts[0] === 'v1' && parts[1] === 'sessions' && parts[2]) {
    const sessionId = parts[2];
    const session = sessions.get(sessionId);

    if (!session) {
      return sendJson(res, 404, { error: 'session not found' });
    }

    if (method === 'GET') {
      const user = users.get(session.user_id);
      const token = createSessionToken(sessionId, session.user_id);

      return sendJson(res, 200, {
        response: {
          ...session,
          user: user,
          token: token,
        },
        session: {
          ...session,
          user: user,
        },
        user: user,
        token: token,
      });
    }

    if (method === 'DELETE') {
      sessions.delete(sessionId);
      // Update client to remove this session
      const client = clients.get(session.client_id);
      if (client) {
        client.sessions = client.sessions.filter(s => s.id !== sessionId);
        client.last_active_session_id = null;
      }
      return sendJson(res, 200, { response: { object: 'session', id: sessionId, deleted: true } },
        { '__session': `; Max-Age=0; ${COOKIE_OPTS}` });
    }

    // POST /v1/sessions/:id/tokens - Create token
    if (parts[3] === 'tokens' && method === 'POST') {
      const token = createSessionToken(sessionId, session.user_id);
      return sendJson(res, 200, {
        response: { object: 'token', jwt: token },
        token: token,
      });
    }
  }

  // /v1/users - List/Create users
  if (path === '/v1/users') {
    if (method === 'GET') {
      const userList = Array.from(users.values());
      return sendJson(res, 200, { data: userList, total_count: userList.length });
    }

    if (method === 'POST') {
      let body;
      try { body = JSON.parse(await readBody(req)); }
      catch { return sendJson(res, 400, { error: 'bad json' }); }

      const userId = generateId('user');
      const emailId = generateId('email');
      const email = body.email_address || `${userId}@findwith.local`;

      const user = {
        id: userId,
        object: 'user',
        username: body.username || null,
        first_name: body.first_name || null,
        last_name: body.last_name || null,
        email_addresses: [
          {
            id: emailId,
            email_address: email,
            verification: { status: 'verified' },
            linked_to: [],
          },
        ],
        phone_numbers: [],
        primary_email_address_id: emailId,
        primary_phone_number_id: null,
        image_url: `https://ui-avatars.com/api/?name=${(body.first_name || 'User')}+${(body.last_name || '')}&background=6366f1&color=fff`,
        created_at: Date.now(),
        updated_at: Date.now(),
        last_sign_in_at: Date.now(),
        public_metadata: body.public_metadata || {},
        private_metadata: {},
        unsafe_metadata: body.unsafe_metadata || {},
        external_accounts: [],
        saml_accounts: [],
        totp_enabled: false,
        two_factor_enabled: false,
        password_enabled: body.password ? true : false,
        password_updated_at: Date.now(),
        profile_image_url: '',
      };
      users.set(userId, user);

      return sendJson(res, 200, {
        response: user,
        user: user,
      });
    }
  }

  // /v1/users/:id - Get/Patch user
  if (parts[0] === 'v1' && parts[1] === 'users' && parts[2]) {
    const userId = parts[2];
    const user = users.get(userId);

    if (!user) {
      return sendJson(res, 404, { error: 'user not found' });
    }

    if (method === 'GET') {
      return sendJson(res, 200, {
        response: user,
        user: user,
      });
    }

    if (method === 'PATCH') {
      let body;
      try { body = JSON.parse(await readBody(req)); }
      catch { return sendJson(res, 400, { error: 'bad json' }); }

      // Update user fields
      if (body.first_name) user.first_name = body.first_name;
      if (body.last_name) user.last_name = body.last_name;
      if (body.username) user.username = body.username;
      if (body.public_metadata) user.public_metadata = body.public_metadata;
      if (body.unsafe_metadata) user.unsafe_metadata = body.unsafe_metadata;
      user.updated_at = Date.now();

      return sendJson(res, 200, {
        response: user,
        user: user,
      });
    }

    if (method === 'DELETE') {
      users.delete(userId);
      // Delete associated sessions
      for (const [sid, sess] of sessions) {
        if (sess.user_id === userId) sessions.delete(sid);
      }
      return sendJson(res, 200, { response: { object: 'user', id: userId, deleted: true } });
    }
  }

  // /v1/sign_ins - Sign in flow
  if (path === '/v1/sign_ins' && method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { return sendJson(res, 400, { error: 'bad json' }); }

    const { identifier, password } = body;

    // Find user by email
    let user = null;
    for (const u of users.values()) {
      if (u.email_addresses.some(e => e.email_address === identifier)) {
        user = u;
        break;
      }
    }

    const signInId = generateId('si');

    if (!user) {
      // User not found - need sign_up
      const signIn = {
        id: signInId,
        object: 'sign_in',
        status: 'needs_identifier',
        supported_identifiers: ['email_address'],
        supported_first_factors: [{ strategy: 'password', safe_identifier: identifier }],
        current_factor: null,
        identifier: identifier,
        client_id: DEV_CLIENT_ID,
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      signIns.set(signInId, signIn);
      return sendJson(res, 200, {
        response: signIn,
        sign_in: signIn,
      });
    }

    // User found - check password (dev: always accept)
    const sessionId = generateId('sess');
    const session = {
      id: sessionId,
      object: 'session',
      status: 'active',
      user_id: user.id,
      client_id: DEV_CLIENT_ID,
      abandon_at: Date.now() + 86400000 * 30,
      expire_at: Date.now() + 86400000,
      last_active_at: Date.now(),
      last_active_organization_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      actor: null,
    };
    sessions.set(sessionId, session);

    // Update client
    const client = clients.get(DEV_CLIENT_ID);
    client.sessions.push(session);
    client.last_active_session_id = sessionId;

    const token = createSessionToken(sessionId, user.id);

    const signIn = {
      id: signInId,
      object: 'sign_in',
      status: 'complete',
      supported_identifiers: ['email_address'],
      supported_first_factors: [{ strategy: 'password', safe_identifier: identifier }],
      current_factor: { strategy: 'password' },
      identifier: identifier,
      client_id: DEV_CLIENT_ID,
      created_at: Date.now(),
      updated_at: Date.now(),
      session_id: sessionId,
      user_id: user.id,
    };
    signIns.set(signInId, signIn);

    return sendJson(res, 200, {
      response: signIn,
      sign_in: signIn,
      created_session: session,
      session: {
        ...session,
        user: user,
      },
      user: user,
      token: token,
    }, { '__session': `${sessionId}; ${COOKIE_OPTS}` });
  }

  // /v1/sign_ins/:id/* - Sign in factor handling
  if (parts[0] === 'v1' && parts[1] === 'sign_ins' && parts[2]) {
    const signInId = parts[2];
    const signIn = signIns.get(signInId);

    if (!signIn) {
      return sendJson(res, 404, { error: 'sign_in not found' });
    }

    // POST /v1/sign_ins/:id/prepare
    if (parts[3] === 'prepare' && method === 'POST') {
      let body;
      try { body = JSON.parse(await readBody(req)); }
      catch { return sendJson(res, 400, { error: 'bad json' }); }

      signIn.current_factor = { strategy: body.strategy || 'password' };
      signIn.status = 'needs_first_factor';
      signIn.updated_at = Date.now();

      return sendJson(res, 200, {
        response: signIn,
        sign_in: signIn,
      });
    }

    // POST /v1/sign_ins/:id/attempt
    if (parts[3] === 'attempt' && method === 'POST') {
      let body;
      try { body = JSON.parse(await readBody(req)); }
      catch { return sendJson(res, 400, { error: 'bad json' }); }

      const { password, code } = body;

      // Dev: always accept
      const user = users.get(DEV_USER_ID);
      const sessionId = generateId('sess');
      const session = {
        id: sessionId,
        object: 'session',
        status: 'active',
        user_id: user.id,
        client_id: DEV_CLIENT_ID,
        abandon_at: Date.now() + 86400000 * 30,
        expire_at: Date.now() + 86400000,
        last_active_at: Date.now(),
        last_active_organization_id: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        actor: null,
      };
      sessions.set(sessionId, session);

      const client = clients.get(DEV_CLIENT_ID);
      client.sessions.push(session);
      client.last_active_session_id = sessionId;

      const token = createSessionToken(sessionId, user.id);

      signIn.status = 'complete';
      signIn.session_id = sessionId;
      signIn.user_id = user.id;
      signIn.updated_at = Date.now();

      return sendJson(res, 200, {
        response: signIn,
        sign_in: signIn,
        created_session: session,
        session: {
          ...session,
          user: user,
        },
        user: user,
        token: token,
      }, { '__session': `${sessionId}; ${COOKIE_OPTS}` });
    }
  }

  // /v1/sign_ups - Sign up flow
  if (path === '/v1/sign_ups' && method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { return sendJson(res, 400, { error: 'bad json' }); }

    const { email_address, password, first_name, last_name, username } = body;

    const signUpId = generateId('su');
    const userId = generateId('user');
    const emailId = generateId('email');

    // Create pending user
    const user = {
      id: userId,
      object: 'user',
      username: username || null,
      first_name: first_name || null,
      last_name: last_name || null,
      email_addresses: [
        {
          id: emailId,
          email_address: email_address,
          verification: { status: 'verified' },
          linked_to: [],
        },
      ],
      phone_numbers: [],
      primary_email_address_id: emailId,
      primary_phone_number_id: null,
      image_url: `https://ui-avatars.com/api/?name=${(first_name || 'User')}+${(last_name || '')}&background=6366f1&color=fff`,
      created_at: Date.now(),
      updated_at: Date.now(),
      last_sign_in_at: Date.now(),
      public_metadata: {},
      private_metadata: {},
      unsafe_metadata: {},
      external_accounts: [],
      saml_accounts: [],
      totp_enabled: false,
      two_factor_enabled: false,
      password_enabled: true,
      password_updated_at: Date.now(),
      profile_image_url: '',
    };

    const signUp = {
      id: signUpId,
      object: 'sign_up',
      status: 'complete',
      email_address: email_address,
      password_enabled: true,
      first_name: first_name,
      last_name: last_name,
      username: username,
      user_id: userId,
      client_id: DEV_CLIENT_ID,
      created_at: Date.now(),
      updated_at: Date.now(),
      verifications: {},
    };
    signUps.set(signUpId, signUp);

    // Create session
    const sessionId = generateId('sess');
    const session = {
      id: sessionId,
      object: 'session',
      status: 'active',
      user_id: userId,
      client_id: DEV_CLIENT_ID,
      abandon_at: Date.now() + 86400000 * 30,
      expire_at: Date.now() + 86400000,
      last_active_at: Date.now(),
      last_active_organization_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      actor: null,
    };
    sessions.set(sessionId, session);

    // Store user
    users.set(userId, user);

    // Update client
    const client = clients.get(DEV_CLIENT_ID);
    client.sessions.push(session);
    client.last_active_session_id = sessionId;

    const token = createSessionToken(sessionId, userId);

    return sendJson(res, 200, {
      response: signUp,
      sign_up: signUp,
      created_user: user,
      created_session: session,
      user: user,
      session: {
        ...session,
        user: user,
      },
      token: token,
    }, { '__session': `${sessionId}; ${COOKIE_OPTS}` });
  }

  // /v1/me - Current user (from session token)
  if (path === '/v1/me' && method === 'GET') {
    const user = users.get(DEV_USER_ID);
    return sendJson(res, 200, {
      response: user,
      user: user,
    });
  }

  // Fallback
  console.log(`[MOCK-CLERK] Unknown endpoint: ${method} ${path}`);
  sendJson(res, 404, { error: 'not found', path });
});

server.listen(PORT, () => {
  console.log(`[MOCK-CLERK] Complete FAPI mock listening on :${PORT}`);
  console.log(`[MOCK-CLERK] Endpoints: /v1/client, /v1/sessions, /v1/users, /v1/sign_ins, /v1/sign_ups, /.well-known/jwks.json`);
});