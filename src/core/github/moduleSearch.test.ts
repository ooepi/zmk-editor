import { describe, expect, it } from 'vitest';
import { GitHubClient } from './client.ts';
import { inspectModule, pickRevision, searchModules } from './moduleSearch.ts';

function fakeApi(routes: Record<string, unknown>) {
  const requests: { url: string; auth: string | null }[] = [];
  const fetchImpl = (input: string, init?: RequestInit) => {
    const url = new URL(input);
    requests.push({ url: url.pathname + url.search, auth: new Headers(init?.headers).get('Authorization') });
    const body = routes[url.pathname];
    return Promise.resolve(
      body === undefined ? new Response('{"message":"Not Found"}', { status: 404 }) : new Response(JSON.stringify(body), { status: 200 }),
    );
  };
  return { requests, fetchImpl };
}

describe('module search', () => {
  it('searches the zmk-module topic, most starred first, anonymously', async () => {
    const api = fakeApi({
      '/search/repositories': {
        total_count: 1,
        items: [
          {
            name: 'zmk-leader-key',
            owner: { login: 'urob' },
            description: null,
            stargazers_count: 200,
            html_url: 'https://github.com/urob/zmk-leader-key',
            pushed_at: '2026-01-02T00:00:00Z',
            archived: false,
          },
        ],
      },
    });
    const { total, results } = await searchModules(new GitHubClient('', api.fetchImpl), 'leader');
    expect(total).toBe(1);
    expect(results[0]).toMatchObject({ owner: 'urob', repo: 'zmk-leader-key', description: '', stars: 200 });
    const [request] = api.requests;
    expect(request?.auth).toBeNull();
    expect(new URLSearchParams(request?.url.split('?')[1]).get('q')).toBe('topic:zmk-module leader');
    expect(request?.url).toContain('sort=stars');
  });

  it('picks the tag matching the ZMK version', () => {
    expect(pickRevision(['v0.2', 'v0.3', 'v0.3.0'], 'v0.3')).toBe('v0.3');
    expect(pickRevision(['v0.2.0', 'v0.3.0', 'v0.3.2', 'v0.3.10'], 'v0.3')).toBe('v0.3.10');
    expect(pickRevision(['v1', 'v0.30'], 'v0.3')).toBeUndefined();
  });

  it('inspects a module: revision, headers, behaviors and shields', async () => {
    const api = fakeApi({
      '/repos/caksoylar/zmk-rgbled-widget': {
        name: 'zmk-rgbled-widget',
        owner: { login: 'caksoylar' },
        default_branch: 'main',
        html_url: 'https://github.com/caksoylar/zmk-rgbled-widget',
        description: 'LED widget',
      },
      '/repos/caksoylar/zmk-rgbled-widget/tags': [{ name: 'v0.3.0' }],
      '/repos/caksoylar/zmk-rgbled-widget/git/trees/v0.3.0': {
        tree: [
          { path: 'zephyr/module.yml', type: 'blob' },
          { path: 'dts/behaviors/rgbled_widget.dtsi', type: 'blob' },
          { path: 'dts/bindings/behaviors/zmk,rgbled-widget.yaml', type: 'blob' },
          { path: 'dts/bindings/behaviors/zmk,behavior-rgbled-widget.yaml', type: 'blob' },
          { path: 'boards/shields/rgbled_adapter/Kconfig.shield', type: 'blob' },
          { path: 'boards/shields/rgbled_adapter/boards/xiao_ble.overlay', type: 'blob' },
        ],
      },
    });
    const inspection = await inspectModule(new GitHubClient('tok', api.fetchImpl), 'caksoylar', 'zmk-rgbled-widget', 'v0.3');
    expect(inspection).toMatchObject({
      revision: 'v0.3.0',
      untagged: false,
      isModule: true,
      includes: ['behaviors/rgbled_widget.dtsi'],
      compatibles: ['zmk,behavior-rgbled-widget'],
      shields: ['rgbled_adapter'],
    });
    expect(inspection.revisionNote).toMatch(/Pinned to v0\.3\.0/);
    expect(api.requests[0]?.auth).toBe('Bearer tok');
  });

  it('falls back to the default branch without a matching tag', async () => {
    const api = fakeApi({
      '/repos/someone/thing': { name: 'thing', owner: { login: 'someone' }, default_branch: 'dev', html_url: 'u', description: null },
      '/repos/someone/thing/tags': [],
      '/repos/someone/thing/git/trees/dev': { tree: [] },
    });
    const inspection = await inspectModule(new GitHubClient('', api.fetchImpl), 'someone', 'thing', 'v0.3');
    expect(inspection).toMatchObject({ revision: 'dev', untagged: true, isModule: false, includes: [] });
  });

  it('follows ZMK when a tag is named like the version', async () => {
    const api = fakeApi({
      '/repos/urob/zmk-leader-key': { name: 'zmk-leader-key', owner: { login: 'urob' }, default_branch: 'main', html_url: 'u', description: null },
      '/repos/urob/zmk-leader-key/tags': [{ name: 'v0.3' }],
      '/repos/urob/zmk-leader-key/git/trees/v0.3': { tree: [{ path: 'zephyr/module.yml', type: 'blob' }] },
    });
    const inspection = await inspectModule(new GitHubClient('', api.fetchImpl), 'urob', 'zmk-leader-key', 'v0.3');
    expect(inspection.revision).toBeUndefined();
    expect(inspection.revisionNote).toMatch(/Follows ZMK v0\.3/);
  });
});
