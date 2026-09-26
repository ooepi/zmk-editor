import {
  authorizeUrl,
  createPkce,
  exchangeCode,
  LoginError,
  randomString,
  type AuthConfig,
  type Tokens,
} from '../../core/github/oauth.ts';

/** Login is available when the build was given the GitHub App and helper settings. */
export function authConfig(): AuthConfig | null {
  const clientId = import.meta.env.VITE_GITHUB_APP_CLIENT_ID;
  const appSlug = import.meta.env.VITE_GITHUB_APP_SLUG;
  const helperUrl = import.meta.env.VITE_AUTH_HELPER_URL;
  return clientId && appSlug && helperUrl ? { clientId, appSlug, helperUrl } : null;
}

/** Swappable for tests (jsdom can't navigate). */
export const navigation = {
  go: (url: string) => window.location.assign(url),
};

const PENDING_KEY = 'zmk-editor.login-pending.v1';
const TOKENS_KEY = 'zmk-editor.login.v1';

/** This page's address without query or hash: the GitHub App's callback URL. */
export function redirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

/** Sends the browser to GitHub; it comes back to this page with ?code&state. */
export async function beginLogin(config: AuthConfig, remember: boolean): Promise<void> {
  const { verifier, challenge } = await createPkce();
  const state = randomString();
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ state, verifier, remember }));
  navigation.go(authorizeUrl(config, { redirectUri: redirectUri(), state, challenge }));
}

/** True when this page load is GitHub's redirect back after login. */
export function isLoginCallback(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has('code') && params.has('state');
}

/**
 * Finishes a login redirect: checks `state` (so another site can't inject a
 * login), redeems the code with the PKCE verifier, and removes the code from
 * the address bar. Returns null when this isn't a login redirect.
 */
export async function completeLogin(config: AuthConfig, fetchImpl?: typeof fetch): Promise<Tokens | null> {
  if (!isLoginCallback()) return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code') ?? '';
  const state = params.get('state');
  window.history.replaceState(null, '', redirectUri() + window.location.hash);
  const raw = sessionStorage.getItem(PENDING_KEY);
  sessionStorage.removeItem(PENDING_KEY);
  const pending = raw ? (JSON.parse(raw) as { state: string; verifier: string; remember: boolean }) : null;
  if (!pending || pending.state !== state) throw new LoginError('The login response did not match this browser. Please log in again.');
  const tokens = await exchangeCode(config, { code, verifier: pending.verifier, redirectUri: redirectUri() }, fetchImpl);
  saveTokens(tokens, pending.remember);
  return tokens;
}

export function loadTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem(TOKENS_KEY) ?? sessionStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

/** `remember` keeps the login across browser restarts; otherwise it lasts until the tab closes. */
export function saveTokens(tokens: Tokens, remember = localStorage.getItem(TOKENS_KEY) !== null): void {
  try {
    clearTokens();
    (remember ? localStorage : sessionStorage).setItem(TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    // Storage unavailable: the login lasts until the page closes.
  }
}

export function clearTokens(): void {
  try {
    localStorage.removeItem(TOKENS_KEY);
    sessionStorage.removeItem(TOKENS_KEY);
  } catch {
    // Nothing stored.
  }
}
