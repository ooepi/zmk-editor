// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubClient } from '../../core/github/client.ts';
import { FakeGitHub } from '../../core/github/fakeGitHub.ts';
import { commitFiles } from '../../core/github/repo.ts';
import { freshTokens } from './githubLogin.ts';
import { openRepo, useBuildSession } from './buildSession.ts';

let fake: FakeGitHub;
/** Requests whose path matches are held until `release()`. */
let hold: RegExp | null;
let held: (() => void)[];

const release = () => {
  for (const go of held.splice(0)) go();
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  fake = new FakeGitHub({ 'config/west.yml': 'west' });
  hold = null;
  held = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const client = () =>
  new GitHubClient('good-token', async (input, init) => {
    if (hold?.test(String(input))) await new Promise<void>((resolve) => held.push(resolve));
    return fake.fetch(input, init);
  });

describe('useBuildSession', () => {
  it('drops a commit that finishes after the user disconnected', async () => {
    const { result } = renderHook(() => useBuildSession());
    const conn = await openRepo(client(), 'me', 'zmk-config', 'main', false);
    act(() => result.current.connect(conn));
    hold = /\/git\/refs\/heads\//;
    let committing!: Promise<void>;
    act(() => {
      committing = result.current.commitAndBuild(conn, [['config/west.yml', 'west 2']], { 'config/west.yml': 'west 2' }, 'Update');
    });
    await waitFor(() => expect(held.length).toBe(1));
    act(() => result.current.disconnect());
    await act(async () => {
      release();
      await committing;
    });
    expect(result.current.connection).toBeNull();
    expect(result.current.build).toEqual({ phase: 'idle' });
  });

  it('keeps a newer connection when an older refresh finishes', async () => {
    const { result } = renderHook(() => useBuildSession());
    const first = await openRepo(client(), 'me', 'zmk-config', 'main', false);
    const second = await openRepo(client(), 'me', 'zmk-config', 'main', false);
    act(() => result.current.connect(first));
    // The branch moves on GitHub, and a refresh starts reading it…
    await commitFiles(client(), first.ref, { 'config/west.yml': 'west 3' }, 'Elsewhere');
    hold = /\/repos\/me\/zmk-config$/;
    let refreshing!: Promise<void>;
    act(() => {
      refreshing = result.current.refresh();
    });
    await waitFor(() => expect(held.length).toBe(1));
    // …while the user opens the repository again (an older read, but their choice wins).
    hold = null;
    act(() => result.current.connect(second));
    await act(async () => {
      release();
      await refreshing;
    });
    expect(result.current.connection).toBe(second);
  });
});

describe('freshTokens', () => {
  it('shares one refresh between callers, since GitHub replaces the refresh token on use', async () => {
    const helper = 'https://auth.example.workers.dev';
    vi.stubEnv('VITE_GITHUB_APP_CLIENT_ID', 'Iv1.test');
    vi.stubEnv('VITE_GITHUB_APP_SLUG', 'zmk-editor-test');
    vi.stubEnv('VITE_AUTH_HELPER_URL', helper);
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (input: string) => {
      calls.push(input);
      return new Response(JSON.stringify({ access_token: 'ghu_new', expires_in: 28800, refresh_token: 'ghr_2' }));
    });
    localStorage.setItem(
      'zmk-editor.login.v1',
      JSON.stringify({ accessToken: 'ghu_old', expiresAt: Date.now() + 60_000, refreshToken: 'ghr_1' }),
    );
    const config = { clientId: 'Iv1.test', appSlug: 'zmk-editor-test', helperUrl: helper };
    const [a, b] = await Promise.all([freshTokens(config), freshTokens(config)]);
    expect(calls).toEqual([`${helper}/refresh`]);
    expect(a.accessToken).toBe('ghu_new');
    expect(b.accessToken).toBe('ghu_new');
  });
});
