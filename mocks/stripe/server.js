/**
 * Stripe API mock for dev and e2e environments.
 *
 * Handles the Stripe endpoints used by StripePaymentAdapter:
 *   POST   /v1/checkout/sessions
 *   POST   /v1/billing_portal/sessions
 *   POST   /v1/subscriptions/:id   (update — pause/resume via pause_collection)
 *   DELETE /v1/subscriptions/:id   (cancel)
 *
 * Configure the backend to use this mock by setting:
 *   STRIPE_MOCK_URL=http://localhost:14802
 *
 * GET /health — Docker healthcheck
 */

import { createServer } from 'http';
import { randomUUID } from 'crypto';

const PORT = parseInt(process.env.PORT || '14802', 10);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Stripe SDK sends application/x-www-form-urlencoded bodies. */
function parseFormBody(raw) {
  const out = {};
  for (const [k, v] of new URLSearchParams(raw)) {
    out[k] = v;
  }
  return out;
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname, method } = { pathname: url.pathname, method: req.method };

  if (pathname === '/health') {
    json(res, { ok: true });
    return;
  }

  const rawBody = await readBody(req);
  const body = parseFormBody(rawBody);

  // POST /v1/checkout/sessions
  if (method === 'POST' && pathname === '/v1/checkout/sessions') {
    const id = `cs_mock_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    json(res, { id, object: 'checkout.session', url: body.success_url || `http://localhost:${PORT}/checkout/${id}`, status: 'open' });
    return;
  }

  // POST /v1/billing_portal/sessions
  if (method === 'POST' && pathname === '/v1/billing_portal/sessions') {
    const id = `bps_mock_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    json(res, { id, object: 'billing_portal.session', url: body.return_url || `http://localhost:${PORT}/portal/${id}` });
    return;
  }

  // /v1/subscriptions/:id
  const subMatch = pathname.match(/^\/v1\/subscriptions\/([^/]+)$/);
  if (subMatch) {
    const subId = subMatch[1];

    if (method === 'DELETE') {
      json(res, { id: subId, object: 'subscription', status: 'canceled' });
      return;
    }

    if (method === 'POST') {
      const pauseBehavior = body['pause_collection[behavior]'] || null;
      json(res, {
        id: subId,
        object: 'subscription',
        status: 'active',
        pause_collection: pauseBehavior ? { behavior: pauseBehavior } : null,
      });
      return;
    }
  }

  json(res, { error: { message: 'Not implemented', type: 'invalid_request_error' } }, 404);
});

server.listen(PORT, () => {
  console.log(`[MOCK-STRIPE] Listening on :${PORT}`);
});
