import { describe, expect, it, vi } from 'vitest';
import { GitHubClient } from './client.ts';
import { FakeGitHub } from './fakeGitHub.ts';
import {
  authorizeUrl,
  createPkce,
  ensureFresh,
  exchangeCode,
  listAppRepos,
  listBranches,
  LoginError,
  type AuthConfig,
} from './oauth.ts';

const config: AuthConfig = { clientId: 'Iv1.client', appSlug: 'zmk-editor', helperUrl: 'https://auth.example.workers.dev/' };

const helper = (body: unknown, status = 200) =>
  vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));

describe('login', () => {
  it('creates a PKCE pair (S256)', async () => {
    const { verifier, challenge } = await createPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const expected = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(challenge).toBe(expected);
  });

  it('builds the GitHub authorize URL', () => {
    const url = new URL(authorizeUrl(config, { redirectUri: 'https://ooepi.github.io/zmk-editor/', state: 's1', challenge: 'c1' }));
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'Iv1.client',
      redirect_uri: 'https://ooepi.github.io/zmk-editor/',
      state: 's1',
      code_challenge: 'c1',
      code_challenge_method: 'S256',
    });
  });

  it('exchanges the code through the helper and computes expiry times', async () => {
    const fetchHelper = helper({ access_token: 'ghu_a', expires_in: 100, refresh_token: 'ghr_b', refresh_token_expires_in: 1000 });
    const tokens = await exchangeCode(config, { code: 'c', verifier: 'v', redirectUri: 'r' }, fetchHelper, 5000);
    expect(tokens).toEqual({ accessToken: 'ghu_a', expiresAt: 105_000, refreshToken: 'ghr_b', refreshExpiresAt: 1_005_000 });
    expect(fetchHelper.mock.calls[0]?.[0]).toBe('https://auth.example.workers.dev/token');
    expect(JSON.parse(String(fetchHelper.mock.calls[0]?.[1]?.body))).toEqual({ code: 'c', code_verifier: 'v', redirect_uri: 'r' });
  });

  it('explains a failed exchange', async () => {
    await expect(exchangeCode(config, { code: 'c', verifier: 'v', redirectUri: 'r' }, helper({ error: 'x', error_description: 'The code expired.' }, 400))).rejects.toThrow(
      /GitHub login failed: The code expired\./,
    );
  });

  it('refreshes only near expiry, and asks to log in again when the refresh token ran out', async () => {
    const fresh = { accessToken: 'a', expiresAt: 10 * 60_000, refreshToken: 'r', refreshExpiresAt: 99 * 60_000 };
    const fetchHelper = helper({ access_token: 'new', expires_in: 28800 });
    expect(await ensureFresh(config, fresh, fetchHelper, 0)).toBe(fresh);
    expect((await ensureFresh(config, fresh, fetchHelper, 8 * 60_000)).accessToken).toBe('new');
    expect(fetchHelper.mock.calls[0]?.[0]).toBe('https://auth.example.workers.dev/refresh');
    await expect(ensureFresh(config, { ...fresh, refreshExpiresAt: 1 }, fetchHelper, 9 * 60_000)).rejects.toBeInstanceOf(LoginError);
  });
});

describe('repos', () => {
  it('lists the repos the app can access, and their branches', async () => {
    const fake = new FakeGitHub({});
    const client = new GitHubClient('good-token', fake.fetch);
    expect(await listAppRepos(client)).toEqual([
      { owner: 'me', repo: 'another', defaultBranch: 'master', private: true },
      { owner: 'me', repo: 'zmk-config', defaultBranch: 'main', private: false },
    ]);
    expect(await listBranches(client, 'me', 'zmk-config')).toEqual(['main', 'editor-test']);
  });
});
