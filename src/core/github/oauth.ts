import type { GitHubClient } from './client.ts';

/** Where "Log in with GitHub" goes: the GitHub App and the login helper (worker/). */
export interface AuthConfig {
  clientId: string;
  /** The app's URL name, for the "choose repositories" link. */
  appSlug: string;
  /** The login helper, e.g. https://zmk-editor-auth.<account>.workers.dev */
  helperUrl: string;
}

export interface Tokens {
  accessToken: string;
  /** Epoch ms; absent when the token doesn't expire. */
  expiresAt?: number;
  refreshToken?: string;
  refreshExpiresAt?: number;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
const defaultFetch: Fetch = (input, init) => fetch(input, init);

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomString(bytes = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** PKCE (RFC 7636, S256): only this browser can redeem the login code. */
export async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomString(48);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

export function authorizeUrl(config: AuthConfig, options: { redirectUri: string; state: string; challenge: string }): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: options.redirectUri,
    state: options.state,
    code_challenge: options.challenge,
    code_challenge_method: 'S256',
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export class LoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoginError';
  }
}

async function callHelper(config: AuthConfig, path: string, body: unknown, fetchImpl: Fetch, now: number): Promise<Tokens> {
  let response: Response;
  try {
    response = await fetchImpl(`${config.helperUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new LoginError("Couldn't reach the login helper. Check your connection, or use a token instead.");
  }
  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof result.access_token !== 'string') {
    const detail = typeof result.error_description === 'string' ? result.error_description : String(result.error ?? response.status);
    throw new LoginError(`GitHub login failed: ${detail}`);
  }
  const seconds = (key: string) => (typeof result[key] === 'number' ? now + (result[key] as number) * 1000 : undefined);
  const tokens: Tokens = { accessToken: result.access_token };
  const expiresAt = seconds('expires_in');
  const refreshExpiresAt = seconds('refresh_token_expires_in');
  if (expiresAt) tokens.expiresAt = expiresAt;
  if (typeof result.refresh_token === 'string') tokens.refreshToken = result.refresh_token;
  if (refreshExpiresAt) tokens.refreshExpiresAt = refreshExpiresAt;
  return tokens;
}

export function exchangeCode(
  config: AuthConfig,
  options: { code: string; verifier: string; redirectUri: string },
  fetchImpl: Fetch = defaultFetch,
  now = Date.now(),
): Promise<Tokens> {
  return callHelper(config, '/token', { code: options.code, code_verifier: options.verifier, redirect_uri: options.redirectUri }, fetchImpl, now);
}

/** Refreshes the access token a few minutes before it expires; throws when the login has run out. */
export async function ensureFresh(config: AuthConfig, tokens: Tokens, fetchImpl: Fetch = defaultFetch, now = Date.now()): Promise<Tokens> {
  if (!tokens.expiresAt || tokens.expiresAt - now > 5 * 60_000) return tokens;
  if (!tokens.refreshToken || (tokens.refreshExpiresAt !== undefined && tokens.refreshExpiresAt <= now)) {
    throw new LoginError('Your GitHub login has expired. Log in again.');
  }
  return callHelper(config, '/refresh', { refresh_token: tokens.refreshToken }, fetchImpl, now);
}

export interface UserRepo {
  owner: string;
  repo: string;
  defaultBranch: string;
  private: boolean;
}

/** Repositories the user gave the GitHub App access to, across their installations. */
export async function listAppRepos(client: GitHubClient): Promise<UserRepo[]> {
  const { installations } = await client.request<{ installations: { id: number }[] }>('/user/installations?per_page=100');
  const repos: UserRepo[] = [];
  for (const installation of installations) {
    for (let page = 1; ; page++) {
      const result = await client.request<{
        total_count: number;
        repositories: { name: string; owner: { login: string }; default_branch: string; private: boolean }[];
      }>(`/user/installations/${installation.id}/repositories?per_page=100&page=${page}`);
      repos.push(
        ...result.repositories.map((r) => ({ owner: r.owner.login, repo: r.name, defaultBranch: r.default_branch, private: r.private })),
      );
      if (result.repositories.length < 100) break;
    }
  }
  return repos.sort((a, b) => `${a.owner}/${a.repo}`.localeCompare(`${b.owner}/${b.repo}`));
}

export async function listBranches(client: GitHubClient, owner: string, repo: string): Promise<string[]> {
  const branches = await client.request<{ name: string }[]>(`/repos/${owner}/${repo}/branches?per_page=100`);
  return branches.map((b) => b.name);
}

export function getUser(client: GitHubClient) {
  return client.request<{ login: string; avatar_url: string }>('/user');
}
