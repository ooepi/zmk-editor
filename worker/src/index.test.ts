import { describe, expect, it, vi } from 'vitest';
import { handle, type Env } from './index.ts';

const env: Env = {
  GITHUB_CLIENT_ID: 'Iv1.client',
  GITHUB_CLIENT_SECRET: 'shh',
  ALLOWED_ORIGINS: 'https://ooepi.github.io, http://localhost:5173',
};
const ORIGIN = 'https://ooepi.github.io';
const VERIFIER = 'v'.repeat(43);

function post(path: string, body: unknown, origin = ORIGIN) {
  return new Request(`https://auth.example.workers.dev${path}`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function github(response: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } }));
}

describe('auth worker', () => {
  it('answers CORS preflight only for allowed origins', async () => {
    const preflight = (origin: string) =>
      handle(new Request('https://x/token', { method: 'OPTIONS', headers: { Origin: origin } }), env, github({}));
    const ok = await preflight(ORIGIN);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect((await preflight('https://evil.example')).status).toBe(403);
  });

  it('exchanges a code (with PKCE) for tokens, adding the secret server-side', async () => {
    const fetchGitHub = github({
      access_token: 'ghu_abc',
      expires_in: 28800,
      refresh_token: 'ghr_def',
      refresh_token_expires_in: 15897600,
      token_type: 'bearer',
      scope: '',
    });
    const response = await handle(post('/token', { code: 'abc123', code_verifier: VERIFIER, redirect_uri: 'https://ooepi.github.io/zmk-editor/' }), env, fetchGitHub);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      access_token: 'ghu_abc',
      expires_in: 28800,
      refresh_token: 'ghr_def',
      refresh_token_expires_in: 15897600,
    });
    const [url, init] = fetchGitHub.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://github.com/login/oauth/access_token');
    expect(JSON.parse(String(init.body))).toEqual({
      client_id: 'Iv1.client',
      client_secret: 'shh',
      code: 'abc123',
      code_verifier: VERIFIER,
      redirect_uri: 'https://ooepi.github.io/zmk-editor/',
    });
  });

  it('refreshes a token', async () => {
    const fetchGitHub = github({ access_token: 'ghu_new', expires_in: 28800, refresh_token: 'ghr_new', refresh_token_expires_in: 1 });
    const response = await handle(post('/refresh', { refresh_token: 'ghr_old' }), env, fetchGitHub);
    expect(response.status).toBe(200);
    const [, init] = fetchGitHub.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'ghr_old', client_secret: 'shh' });
  });

  it('passes on GitHub errors without the secret', async () => {
    const response = await handle(post('/token', { code: 'used' }), env, github({ error: 'bad_verification_code', error_description: 'The code passed is incorrect or expired.' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'bad_verification_code', error_description: 'The code passed is incorrect or expired.' });
  });

  it('rejects other origins, bad input and unknown paths without calling GitHub', async () => {
    const fetchGitHub = github({});
    expect((await handle(post('/token', { code: 'abc' }, 'https://evil.example'), env, fetchGitHub)).status).toBe(403);
    expect((await handle(post('/token', { code: 'has spaces!' }), env, fetchGitHub)).status).toBe(400);
    expect((await handle(post('/token', { code: 'abc', code_verifier: 'short' }), env, fetchGitHub)).status).toBe(400);
    expect((await handle(post('/token', 'x'.repeat(10_000)), env, fetchGitHub)).status).toBe(413);
    expect((await handle(post('/steal', { code: 'abc' }), env, fetchGitHub)).status).toBe(404);
    expect(fetchGitHub).not.toHaveBeenCalled();
  });

  it('has a health check', async () => {
    const response = await handle(new Request('https://x/'), env, github({}));
    expect(await response.text()).toMatch(/zmk-editor auth/);
  });
});
