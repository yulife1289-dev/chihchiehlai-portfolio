const ALLOWED_ORIGIN = 'https://yulife1289-dev.github.io';
const MAX_BODY_BYTES = 512;
const REQUEST_TIMEOUT_MS = 5_000;
const RELAY_PATH = '/webhook/chihchiehlai-portfolio-visit';
const encoder = new TextEncoder();

const projectSlugs = [
  'tianmu-ye', 'muzha-yuanli', 'linkou-weige', 'taoyuan-yaxin',
  'kaohsiung-the-one', 'public-amenities', 'fubon-jiuzhuang',
  'xinyi-crown', 'yipinju', 'tainan-holiday-home',
  'fubon-liren-amenities', 'baohui-qiuhonggu', 'tianmu-lin',
  'nanjing-xie', 'new-xiangshan',
];

const allowedPages = new Set([
  '/chihchiehlai-portfolio/',
  '/chihchiehlai-portfolio/#projects',
  '/chihchiehlai-portfolio/#resume',
  ...projectSlugs.map((slug) => `/chihchiehlai-portfolio/#project/${slug}`),
]);

function corsHeaders(origin) {
  if (origin !== ALLOWED_ORIGIN) return {};
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function response(status, origin, body = null, extraHeaders = {}) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    ...corsHeaders(origin),
    ...extraHeaders,
  });
  if (body !== null) headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

async function readBodyLimited(request) {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new RangeError('body_too_large');
  }
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError('body_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function parseVisit(rawBody) {
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!payload || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype) return null;
  if (Object.keys(payload).length !== 1 || typeof payload.page !== 'string') return null;
  if (!allowedPages.has(payload.page)) return null;
  return payload.page;
}

function randomNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sourceIpForPayload(request) {
  // Cloudflare supplies this request header at its edge. It is never read from
  // the browser request body, so a visitor cannot choose the displayed value.
  const ipAddress = request.headers.get('cf-connecting-ip')?.trim();
  return ipAddress && ipAddress.length <= 45 ? ipAddress : 'unavailable';
}

function locationPart(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 80 && /^[\p{L}\p{N}\s.'-]+$/u.test(normalized) ? normalized : null;
}

function sourceLocationForPayload(request) {
  const location = [request.cf?.country, request.cf?.region, request.cf?.city]
    .map(locationPart)
    .filter(Boolean);
  return location.length ? location.join(' / ') : 'unavailable';
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function rateLimitKey(ipAddress) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(ipAddress || 'unknown'));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function handleRequest(request, env, { fetchImpl = fetch, now = Date.now() } = {}) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    const requestedMethod = request.headers.get('access-control-request-method');
    if (url.pathname !== '/visit' || origin !== ALLOWED_ORIGIN || requestedMethod !== 'POST') {
      return response(403, origin, { error: 'forbidden' });
    }
    return response(204, origin);
  }
  if (url.pathname !== '/visit') return response(404, origin, { error: 'not_found' });
  if (request.method !== 'POST') return response(405, origin, { error: 'method_not_allowed' }, { Allow: 'POST, OPTIONS' });
  if (origin !== ALLOWED_ORIGIN) return response(403, origin, { error: 'forbidden' });
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return response(415, origin, { error: 'unsupported_media_type' });
  }

  let rawBody;
  try {
    rawBody = await readBodyLimited(request);
  } catch (error) {
    if (error instanceof RangeError) return response(413, origin, { error: 'payload_too_large' });
    return response(400, origin, { error: 'invalid_request' });
  }
  const page = parseVisit(rawBody);
  if (!page) return response(400, origin, { error: 'invalid_request' });

  const clientKey = await rateLimitKey(request.headers.get('cf-connecting-ip'));
  const [visitorLimit, notificationBudget] = await Promise.all([
    env.VISITOR_RATE_LIMITER.limit({ key: clientKey }),
    env.NOTIFICATION_BUDGET.limit({ key: 'portfolio-visit' }),
  ]);
  if (!visitorLimit.success || !notificationBudget.success) {
    return response(429, origin, { error: 'rate_limited' });
  }

  const outboundBody = JSON.stringify({
    event: 'portfolio_visit',
    page,
    sourceIp: sourceIpForPayload(request),
    sourceLocation: sourceLocationForPayload(request),
    test: false,
  });
  const timestamp = String(Math.floor(now / 1_000));
  const nonce = randomNonce();
  const signature = await hmacHex(env.RELAY_HMAC_SECRET, `v1.${RELAY_PATH}.${timestamp}.${nonce}.${outboundBody}`);

  try {
    const upstream = await fetchImpl(env.NGROK_WEBHOOK_URL, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        'X-Portfolio-Timestamp': timestamp,
        'X-Portfolio-Nonce': nonce,
        'X-Portfolio-Signature': `v1=${signature}`,
      },
      body: outboundBody,
    });
    if (!upstream.ok) return response(502, origin, { error: 'upstream_unavailable' });
  } catch {
    return response(502, origin, { error: 'upstream_unavailable' });
  }

  return response(202, origin, { accepted: true });
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
