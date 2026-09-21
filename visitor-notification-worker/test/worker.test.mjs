import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRequest } from '../src/index.js';

const ORIGIN = 'https://yulife1289-dev.github.io';

function makeEnv({ visitor = true, budget = true } = {}) {
  return {
    RELAY_HMAC_SECRET: 'test-secret',
    NGROK_WEBHOOK_URL: 'https://relay.example.test/webhook/chihchiehlai-portfolio-visit',
    VISITOR_RATE_LIMITER: { limit: async () => ({ success: visitor }) },
    NOTIFICATION_BUDGET: { limit: async () => ({ success: budget }) },
  };
}

function visitRequest({ page = '/chihchiehlai-portfolio/#projects', origin = ORIGIN, body, method = 'POST', headers = {} } = {}) {
  const request = new Request('https://portfolio-visit-notify.example.workers.dev/visit', {
    method,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.9',
      ...headers,
    },
    body: method === 'POST' ? (body ?? JSON.stringify({ page })) : undefined,
  });
  Object.defineProperty(request, 'cf', { value: { country: 'TW', region: 'Taipei City', city: 'Taipei' } });
  return request;
}

test('accepts a valid visit and signs a fixed payload', async () => {
  let upstream;
  const response = await handleRequest(visitRequest(), makeEnv(), {
    now: 1_700_000_000_000,
    fetchImpl: async (url, init) => {
      upstream = { url, init };
      return new Response(null, { status: 204 });
    },
  });
  assert.equal(response.status, 202);
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(upstream.url, 'https://relay.example.test/webhook/chihchiehlai-portfolio-visit');
  assert.deepEqual(JSON.parse(upstream.init.body), {
    event: 'portfolio_visit',
    page: '/chihchiehlai-portfolio/#projects',
    sourceIp: '203.0.113.9',
    sourceLocation: 'TW / Taipei City / Taipei',
    test: false,
  });
  assert.match(upstream.init.headers['X-Portfolio-Signature'], /^v1=[0-9a-f]{64}$/);
});

test('rejects a wrong origin without calling the relay', async () => {
  const response = await handleRequest(visitRequest({ origin: 'https://attacker.example' }), makeEnv(), {
    fetchImpl: async () => assert.fail('relay must not be called'),
  });
  assert.equal(response.status, 403);
});

test('rejects an unknown page and arbitrary fields', async () => {
  const response = await handleRequest(visitRequest({ body: JSON.stringify({ page: '/nope', message: 'inject' }) }), makeEnv());
  assert.equal(response.status, 400);
});

test('enforces streamed size limits even when Content-Length is absent', async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`{\"page\":\"${'x'.repeat(600)}\"}`));
      controller.close();
    },
  });
  const request = new Request('https://worker.example/visit', {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: stream,
    duplex: 'half',
  });
  const response = await handleRequest(request, makeEnv());
  assert.equal(response.status, 413);
});

test('rejects unsupported methods and rate-limited requests', async () => {
  const wrongMethod = await handleRequest(visitRequest({ method: 'GET' }), makeEnv());
  assert.equal(wrongMethod.status, 405);
  const limited = await handleRequest(visitRequest(), makeEnv({ visitor: false }));
  assert.equal(limited.status, 429);
});

test('does not leak upstream errors', async () => {
  const response = await handleRequest(visitRequest(), makeEnv(), {
    fetchImpl: async () => new Response('private diagnostic', { status: 500 }),
  });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'upstream_unavailable' });
});
