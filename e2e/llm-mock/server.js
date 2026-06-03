/**
 * LLM mock server for e2e tests.
 *
 * Replay mode (default): matches incoming chat completion requests to fixture files.
 * Matching strategy (in order):
 *   1. Exact SHA-256 hash of normalized messages array
 *   2. Scenario name from X-E2E-Scenario request header
 *   3. Keyword-based heuristic on system prompt content
 *
 * Recording mode (LLM_RECORD=true): proxies to real OpenAI and saves fixtures.
 *
 * Hash normalization applied before SHA-256:
 *   - 26-char uppercase ULIDs replaced with <ID>
 *   - ISO-8601 datetimes replaced with <TS>
 *   - 13-digit epoch milliseconds replaced with <EPOCH>
 */

import { createServer } from 'http';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '11435', 10);
const LLM_RECORD = process.env.LLM_RECORD === 'true';
const FIXTURES_DIR = join(__dirname, 'fixtures');

// ── Normalization ────────────────────────────────────────────────────────────

function normalizeMessages(messages) {
  const raw = JSON.stringify(messages);
  return raw
    .replace(/[0-9A-Z]{26}/g, '<ID>')
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.Z+\-]+/g, '<TS>')
    .replace(/\b\d{13}\b/g, '<EPOCH>');
}

function hashMessages(messages) {
  return createHash('sha256').update(normalizeMessages(messages)).digest('hex');
}

// ── Fixture index ────────────────────────────────────────────────────────────

/** Load all fixtures at startup into memory (hash-keyed and name-keyed). */
function loadFixtures() {
  const byHash = {};
  const byScenario = {};

  if (!existsSync(FIXTURES_DIR)) return { byHash, byScenario };

  for (const file of readdirSync(FIXTURES_DIR)) {
    if (!file.endsWith('.json')) continue;
    try {
      const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf8'));
      if (fixture.requestHash) byHash[fixture.requestHash] = fixture;
      const scenario = fixture.scenarioName || file.replace(/\.json$/, '');
      byScenario[scenario] = fixture;
    } catch {
      // ignore malformed fixtures
    }
  }

  return { byHash, byScenario };
}

// ── Keyword heuristic ────────────────────────────────────────────────────────

const HEURISTICS = [
  { keywords: ['parse.*resume', 'extract.*profile', 'structure.*cv'], scenario: 'onboarding-resume-parse' },
  { keywords: ['classify.*email', 'interview.*invite', 'rejection', 'followup.*email'], scenario: 'followup-email-classify' },
  { keywords: ['farewell', 'accepted.*offer', 'job.*search.*over', 'goodbye'], scenario: 'farewell-summary' },
  { keywords: ['company.*research', 'glassdoor', 'recent.*news'], scenario: 'job-analysis-company-research' },
  { keywords: ['match.*score', 'surface.*match', 'deep.*match', 'gap.*analysis'], scenario: 'job-analysis-match-score' },
  { keywords: ['parse.*job.*description', 'extract.*requirements', 'hard.*skills.*soft.*skills'], scenario: 'job-analysis-jd-parse' },
  { keywords: ['tailor.*resume', 'initial.*draft', 'generate.*bullets'], scenario: 'tailoring-initial-draft' },
  { keywords: ['gap.*mining', 'stakeholder', 'cross.*functional'], scenario: 'tailoring-gap-mining' },
  { keywords: ['edit.*bullet', 'rewrite.*bullet', 'shorter'], scenario: 'tailoring-bullet-edit' },
];

function guessScenario(messages) {
  const combined = messages.map((m) => m.content || '').join(' ').toLowerCase();
  for (const { keywords, scenario } of HEURISTICS) {
    if (keywords.some((kw) => new RegExp(kw, 'i').test(combined))) {
      return scenario;
    }
  }
  return null;
}

// ── Embedding mock ───────────────────────────────────────────────────────────

function mockEmbedding(input) {
  const text = Array.isArray(input) ? input[0] : input;
  const seed = createHash('sha256').update(String(text)).digest();
  const dims = 1536;
  const vector = [];
  let norm = 0;
  for (let i = 0; i < dims; i++) {
    const v = (seed[i % 32] / 128 - 1) * 0.1;
    vector.push(v);
    norm += v * v;
  }
  norm = Math.sqrt(norm);
  const normalized = vector.map((v) => v / norm);
  return {
    object: 'list',
    data: [{ object: 'embedding', index: 0, embedding: normalized }],
    model: 'text-embedding-3-small',
    usage: { prompt_tokens: 8, total_tokens: 8 },
  };
}

// ── Request body parser ──────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ── Main server ──────────────────────────────────────────────────────────────

let fixtures = loadFixtures();

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // Health check
  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Reload fixtures on demand (useful during test dev)
  if (path === '/reload') {
    fixtures = loadFixtures();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end();
    return;
  }

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'bad json' }));
    return;
  }

  // ── Embeddings endpoint ────────────────────────────────────────────────────
  if (path === '/v1/embeddings') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mockEmbedding(body.input)));
    return;
  }

  // ── Chat completions ───────────────────────────────────────────────────────
  if (path !== '/v1/chat/completions') {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  const messages = body.messages || [];

  if (LLM_RECORD) {
    // Recording mode — proxy to real OpenAI
    const hash = hashMessages(messages);
    try {
      const upstreamRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify(body),
      });
      const upstream = await upstreamRes.json();
      const scenario = req.headers['x-e2e-scenario'] || guessScenario(messages) || hash.slice(0, 8);
      const fixturePath = join(FIXTURES_DIR, `${scenario}.json`);
      writeFileSync(
        fixturePath,
        JSON.stringify({ endpoint: '/v1/chat/completions', requestHash: hash, scenarioName: scenario, response: upstream }, null, 2),
      );
      console.log(`[LLM-MOCK] Recorded fixture: ${scenario}.json (hash=${hash.slice(0, 8)})`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(upstream));
    } catch (err) {
      console.error('[LLM-MOCK] Recording error:', err);
      res.writeHead(502);
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }

  // Replay mode — find fixture
  const hash = hashMessages(messages);
  const scenarioHeader = req.headers['x-e2e-scenario'];

  let fixture =
    fixtures.byHash[hash] ||
    (scenarioHeader && fixtures.byScenario[scenarioHeader]) ||
    (guessScenario(messages) && fixtures.byScenario[guessScenario(messages)]);

  if (!fixture) {
    console.warn(`[LLM-MOCK] No fixture for hash=${hash.slice(0, 8)} scenario=${scenarioHeader || '?'}`);
    // Return a generic assistant response so tests can at least proceed
    const fallback = {
      id: 'mock-fallback',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: body.model || 'gpt-4o',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: '[LLM-MOCK] No fixture matched — using fallback response.' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(fallback));
    return;
  }

  console.log(`[LLM-MOCK] Serving fixture: ${fixture.scenarioName || hash.slice(0, 8)}`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(fixture.response));
});

server.listen(PORT, () => {
  console.log(`[LLM-MOCK] Listening on :${PORT} (record=${LLM_RECORD})`);
});
