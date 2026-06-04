/**
 * LLM mock server for e2e tests.
 *
 * Replay mode (default): matches incoming chat completion requests to fixture files.
 * Matching strategy (in order):
 *   1. Exact SHA-256 hash of normalized messages array
 *   2. Scenario name from X-E2E-Scenario request header
 *   3. Keyword-based heuristic on system prompt + body content
 *
 * Recording mode (LLM_RECORD=true): proxies to real OpenAI and saves fixtures.
 *
 * Streaming: pi-ai always sets stream:true, so ALL chat/completion requests are
 * returned as text/event-stream SSE (even for "complete" one-shot calls).
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

function getContent(msg) {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) return msg.content.map((b) => b.text || '').join(' ');
  return '';
}

/**
 * Guess scenario from messages content and request body context.
 *
 * Checks specific message roles to avoid false matches from the Quinn system
 * prompt (which mentions all behaviors including farewell, offers, etc.).
 *
 * @param {Array} messages
 * @param {Array|undefined} tools  - tools array from request body
 */
function guessScenario(messages, tools) {
  const systemMsg = messages.find((m) => m.role === 'system');
  const sys = getContent(systemMsg || {}).toLowerCase();

  const userMsgs = messages.filter((m) => m.role === 'user');
  const lastUser = userMsgs[userMsgs.length - 1];
  const lastUserText = getContent(lastUser || {}).toLowerCase();
  const allUserText = userMsgs.map(getContent).join(' ').toLowerCase();

  // ── Tool inner calls (identified by their own system prompt) ──────────────

  // mine_shining_point's own inner LLM call
  if (/career coach.*extracts professional achievements|extracts professional achievements/i.test(sys)) {
    return 'mine-shining-point-extract';
  }

  // ── One-shot structured extraction (identified by specific system prompts) ─

  // Resume parsing — system prompt is a parse/extract instruction
  if (/parse.*resume|extract.*profile|structure.*cv/i.test(sys + ' ' + allUserText)) {
    return 'onboarding-resume-parse';
  }

  // Email classification
  if (/classify.*email|interview.*invite.*classification/i.test(sys)) {
    return 'followup-email-classify';
  }

  // Job analysis — match on system message instructions, not Quinn's general prompt
  if (/you research companies|research.*companies.*return.*json/i.test(sys)) {
    return 'job-analysis-company-research';
  }
  if (/parse.*job.*description.*structured.*json|parse job descriptions/i.test(sys)) {
    return 'job-analysis-jd-parse';
  }

  // Job analysis conversation — Quinn responding after analysis completes (check mismatch first)
  if (/job.analysis.complete/i.test(lastUserText) && /mismatch/i.test(lastUserText)) {
    return 'job-analysis-quinn-skip';
  }
  if (/job.analysis.complete/i.test(lastUserText)) {
    return 'job-analysis-quinn-apply';
  }

  // Tailoring initial draft — identified by specific system prompt from tailoring.processor.ts
  if (/you write tailored resume sections|write tailored resume/i.test(sys)) {
    return 'tailoring-initial-draft';
  }
  // Gap mining — user shares an experience after loading tailored resume (conversation context)
  if (/loaded.*tailored resume|what are the key gaps/i.test(lastUserText)
    || (/coordinated|cross-functional|engineering team/i.test(lastUserText) && !sys.includes('parse') && !sys.includes('research'))) {
    return 'tailoring-gap-mining';
  }
  if (/edit.*bullet.*text|rewrite.*bullet/i.test(sys)) {
    return 'tailoring-bullet-edit';
  }

  // ── Conversation scenarios (check tools list + last user message) ──────────

  const hasMineShiningTool = Array.isArray(tools) && tools.some(
    (t) => (t.function?.name || t.name) === 'mine_shining_point',
  );
  const hasToolResult = messages.some((m) => m.role === 'tool');

  // After mine_shining_point ran — continue conversation
  if (hasMineShiningTool && hasToolResult) {
    return 'onboarding-post-mine';
  }

  // User just shared an experience → Quinn should call mine_shining_point
  if (hasMineShiningTool && lastUser) {
    const skip = lastUserText.includes('resume has been uploaded')
      || lastUserText.includes('please ask me')
      || lastUserText.includes('what are the key gaps')
      || lastUserText.includes('loaded my tailored resume')
      || lastUserText.length < 6;
    if (!skip) {
      return 'onboarding-mine-shining';
    }
  }

  // Farewell — check LAST USER message only (not system prompt, which mentions offers)
  if (/accepted.*offer|got.*the.*offer|taking.*the.*job|i accept/i.test(lastUserText)) {
    return 'farewell-summary';
  }

  return null;
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

/**
 * Convert a stored fixture response (OpenAI non-streaming format) to SSE chunks
 * and stream them to the client.
 *
 * Handles:
 *   - Text content  → single delta chunk + finish chunk + [DONE]
 *   - Tool calls    → one chunk per tool call + finish chunk + [DONE]
 */
function sendSSE(res, completionResponse) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const id = completionResponse.id || 'chatcmpl-mock';
  const model = completionResponse.model || 'gpt-4o';
  const created = completionResponse.created || Math.floor(Date.now() / 1000);
  const choice = Array.isArray(completionResponse.choices) ? completionResponse.choices[0] : undefined;

  if (!choice) {
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  const finishReason = choice.finish_reason || 'stop';
  const toolCalls = choice.message?.tool_calls;
  const content = choice.message?.content;

  const base = { id, object: 'chat.completion.chunk', created, model };

  if (toolCalls && toolCalls.length > 0) {
    // Emit one chunk per tool call with streaming delta format
    toolCalls.forEach((tc, i) => {
      const chunk = {
        ...base,
        choices: [{
          index: 0,
          delta: {
            ...(i === 0 ? { role: 'assistant' } : {}),
            content: null,
            tool_calls: [{
              index: i,
              id: tc.id || `call_mock_${i}`,
              type: 'function',
              function: {
                name: tc.function?.name || '',
                arguments: tc.function?.arguments || '{}',
              },
            }],
          },
          finish_reason: null,
        }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    });
    // Finish chunk
    res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: finishReason }] })}\n\n`);
  } else if (content != null && content !== '') {
    // Text content: single delta chunk then finish
    res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: finishReason }] })}\n\n`);
  } else {
    // Empty content — just finish
    res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: finishReason }] })}\n\n`);
  }

  res.write('data: [DONE]\n\n');
  res.end();
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
  const tools = body.tools || undefined;
  const wantSSE = body.stream === true;

  // Debug: log tool names for ONBOARDING-style requests
  if (tools && tools.length > 0) {
    console.log(`[LLM-MOCK] tools[${tools.length}]: ${tools.map((t) => t.function?.name || t.name || '?').join(', ')}`);
  } else {
    console.log(`[LLM-MOCK] no tools in request (stream=${wantSSE}, msgs=${messages.length})`);
  }

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
      const scenario = req.headers['x-e2e-scenario'] || guessScenario(messages, tools) || hash.slice(0, 8);
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

  const guessed = guessScenario(messages, tools);
  let fixture =
    fixtures.byHash[hash] ||
    (scenarioHeader && fixtures.byScenario[scenarioHeader]) ||
    (guessed && fixtures.byScenario[guessed]);

  if (!fixture) {
    console.warn(`[LLM-MOCK] No fixture for hash=${hash.slice(0, 8)} scenario=${scenarioHeader || guessed || '?'}`);
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
    if (wantSSE) {
      sendSSE(res, fallback);
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(fallback));
    }
    return;
  }

  console.log(`[LLM-MOCK] Serving fixture: ${fixture.scenarioName || hash.slice(0, 8)}`);
  if (wantSSE) {
    sendSSE(res, fixture.response);
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(fixture.response));
  }
});

server.listen(PORT, () => {
  console.log(`[LLM-MOCK] Listening on :${PORT} (record=${LLM_RECORD})`);
});
