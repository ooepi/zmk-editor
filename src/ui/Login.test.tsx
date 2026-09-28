// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateConfig } from '../core/config.ts';
import { FakeGitHub } from '../core/github/fakeGitHub.ts';
import { App } from './App.tsx';
import { demoConfig } from './state/demo.ts';
import { navigation, normalizeAppSlug } from './state/githubLogin.ts';

const HELPER = 'https://auth.example.workers.dev';
let fake: FakeGitHub;
let helperCalls: { path: string; body: Record<string, unknown> }[];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/zmk-editor/');
  vi.stubEnv('VITE_GITHUB_APP_CLIENT_ID', 'Iv1.test');
  vi.stubEnv('VITE_GITHUB_APP_SLUG', 'zmk-editor-test');
  vi.stubEnv('VITE_AUTH_HELPER_URL', HELPER);
  fake = new FakeGitHub(generateConfig(demoConfig().config));
  fake.token = 'ghu_user';
  helperCalls = [];
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    if (input.startsWith(HELPER)) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      helperCalls.push({ path: new URL(input).pathname, body });
      return new Response(JSON.stringify({ access_token: 'ghu_user', expires_in: 28800, refresh_token: 'ghr_1', refresh_token_expires_in: 15897600 }));
    }
    return fake.fetch(input, init);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Log in with GitHub', () => {
  it('sends the browser to GitHub with PKCE and a state', async () => {
    const user = userEvent.setup();
    const go = vi.spyOn(navigation, 'go').mockImplementation(() => undefined);
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Build & flash' }));
    await user.click(screen.getByRole('button', { name: 'Log in with GitHub' }));
    await vi.waitFor(() => expect(go).toHaveBeenCalled());
    const url = new URL(String(go.mock.calls[0]?.[0]));
    expect(url.host).toBe('github.com');
    expect(url.searchParams.get('client_id')).toBe('Iv1.test');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/zmk-editor/');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const pending = JSON.parse(sessionStorage.getItem('zmk-editor.login-pending.v1') ?? '{}') as { state: string };
    expect(url.searchParams.get('state')).toBe(pending.state);
  });

  it('finishes the login when GitHub redirects back, then opens a chosen repo', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('zmk-editor.login-pending.v1', JSON.stringify({ state: 's1', verifier: 'v'.repeat(64), remember: true }));
    window.history.replaceState(null, '', '/zmk-editor/?code=abc&state=s1');
    render(<App />);

    expect(await screen.findByText(/Logged in as/)).toBeTruthy();
    expect(window.location.search).toBe('');
    expect(helperCalls).toEqual([
      { path: '/token', body: { code: 'abc', code_verifier: 'v'.repeat(64), redirect_uri: 'http://localhost:3000/zmk-editor/' } },
    ]);
    expect(localStorage.getItem('zmk-editor.login.v1')).toContain('ghu_user');

    const repo = screen.getByRole('combobox', { name: 'Repository' }) as HTMLSelectElement;
    expect([...repo.options].map((o) => o.value)).toEqual(['me/another', 'me/zmk-config']);
    await user.selectOptions(repo, 'me/zmk-config');
    const branch = screen.getByRole('combobox', { name: 'Branch' }) as HTMLSelectElement;
    await vi.waitFor(() => expect([...branch.options].map((o) => o.value)).toEqual(['main', 'editor-test']));
    await user.click(screen.getByRole('button', { name: 'Open repository' }));
    expect(await screen.findByText(/Connected to/)).toBeTruthy();
    expect(screen.getByText('The branch already matches the editor.')).toBeTruthy();
  });

  it('rejects a login response that this browser did not start', async () => {
    sessionStorage.setItem('zmk-editor.login-pending.v1', JSON.stringify({ state: 'mine', verifier: 'v'.repeat(64), remember: true }));
    window.history.replaceState(null, '', '/zmk-editor/?code=abc&state=forged');
    render(<App />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/did not match this browser/);
    expect(helperCalls).toEqual([]);
  });

  it('keeps the token form as a fallback', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Build & flash' }));
    await user.click(screen.getByText('Use a token instead'));
    expect(screen.getByLabelText('Token')).toBeTruthy();
  });
});

describe('normalizeAppSlug', () => {
  it('accepts the app name or its full URL', () => {
    expect(normalizeAppSlug('zmk-editor-ooepi')).toBe('zmk-editor-ooepi');
    expect(normalizeAppSlug(' https://github.com/apps/zmk-editor-ooepi/ ')).toBe('zmk-editor-ooepi');
    expect(normalizeAppSlug('github.com/apps/zmk-editor-ooepi/installations/new')).toBe('zmk-editor-ooepi');
  });
});
