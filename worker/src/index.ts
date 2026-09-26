/**
 * ZMK Editor login helper (Cloudflare Worker).
 *
 * Its only job: finish a "Log in with GitHub" by trading the one-time code
 * for a user token (and later refresh it). That trade needs the GitHub App's
 * client secret, which must never be in the web page; it lives here as a
 * Worker secret. Nothing is stored or logged, and only the editor's own
 * origins may call it.
 */
export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** Comma-separated origins allowed to call the helper. */
  ALLOWED_ORIGINS: string;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const MAX_BODY = 4096;
const CODE = /^[A-Za-z0-9_-]{1,100}$/;
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const REFRESH = /^[A-Za-z0-9_.-]{1,512}$/;
const TOKEN_FIELDS = ['access_token', 'expires_in', 'refresh_token', 'refresh_token_expires_in'] as const;

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  return origin && allowed.includes(origin) ? origin : null;
}

function json(status: number, body: unknown, origin: string | null): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(JSON.stringify(body), { status, headers });
}

async function readBody(request: Request): Promise<Record<string, unknown> | 'too-large' | null> {
  const text = await request.text();
  if (text.length > MAX_BODY) return 'too-large';
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (value: unknown) => (typeof value === 'string' ? value : undefined);

export async function handle(request: Request, env: Env, fetchImpl: Fetch = (input, init) => fetch(input, init)): Promise<Response> {
  const url = new URL(request.url);
  const origin = allowedOrigin(request, env);

  if (request.method === 'GET' && url.pathname === '/') {
    return new Response('zmk-editor auth helper: exchanges GitHub login codes for the ZMK Editor.', { headers: { 'Content-Type': 'text/plain' } });
  }
  if (url.pathname !== '/token' && url.pathname !== '/refresh') return json(404, { error: 'not_found' }, origin);
  if (!origin) return json(403, { error: 'origin_not_allowed' }, null);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      },
    });
  }
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, origin);

  const body = await readBody(request);
  if (body === 'too-large') return json(413, { error: 'too_large' }, origin);
  if (!body) return json(400, { error: 'bad_request' }, origin);

  const params: Record<string, string> = { client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET };
  if (url.pathname === '/token') {
    const code = str(body.code);
    const verifier = str(body.code_verifier);
    const redirect = str(body.redirect_uri);
    if (!code || !CODE.test(code) || (verifier !== undefined && !VERIFIER.test(verifier))) {
      return json(400, { error: 'bad_request' }, origin);
    }
    params.code = code;
    if (verifier) params.code_verifier = verifier;
    if (redirect && /^https?:\/\/[^\s]+$/.test(redirect)) params.redirect_uri = redirect;
  } else {
    const refresh = str(body.refresh_token);
    if (!refresh || !REFRESH.test(refresh)) return json(400, { error: 'bad_request' }, origin);
    params.grant_type = 'refresh_token';
    params.refresh_token = refresh;
  }

  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'zmk-editor-auth' },
    body: JSON.stringify(params),
  });
  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof result.access_token !== 'string') {
    return json(400, { error: str(result.error) ?? 'exchange_failed', error_description: str(result.error_description) ?? 'GitHub did not return a token.' }, origin);
  }
  return json(200, Object.fromEntries(TOKEN_FIELDS.filter((f) => f in result).map((f) => [f, result[f]])), origin);
}

export default {
  fetch: (request: Request, env: Env) => handle(request, env),
};
