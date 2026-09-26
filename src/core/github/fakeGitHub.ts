/**
 * An in-memory GitHub API for tests: a repo with one branch, workflow runs
 * and artifacts. `fetch` routes requests like api.github.com would.
 */
export interface FakeRun {
  id: number;
  head_sha: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | null;
  html_url: string;
  /** Artifact zips for this run. */
  artifacts: { id: number; name: string; zip: Uint8Array }[];
}

interface Commit {
  tree: string;
  parents: string[];
  message: string;
}

export class FakeGitHub {
  token = 'good-token';
  files: Record<string, string>;
  headSha = 'commit-0';
  commits = new Map<string, Commit>();
  trees = new Map<string, Record<string, string>>();
  runs: FakeRun[] = [];
  requests: { method: string; path: string; body?: unknown }[] = [];
  /** Called after each commit, e.g. to start a run. */
  onCommit?: (sha: string) => void;
  /** Simulates the browser blocking the artifact redirect. */
  blockArtifactDownload = false;
  private counter = 0;

  constructor(files: Record<string, string>) {
    this.files = files;
    this.trees.set('tree-0', { ...files });
    this.commits.set('commit-0', { tree: 'tree-0', parents: [], message: 'initial' });
  }

  private json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }

  private headTree(): Record<string, string> {
    const commit = this.commits.get(this.headSha);
    return this.trees.get(commit?.tree ?? '') ?? {};
  }

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const path = url.pathname;
    this.requests.push({ method, path, body });
    const auth = new Headers(init?.headers).get('Authorization');
    if (auth !== `Bearer ${this.token}`) return this.json(401, { message: 'Bad credentials' });
    const repo = '/repos/me/zmk-config';
    if (!path.startsWith(repo)) return this.json(404, { message: 'Not Found' });
    const rest = path.slice(repo.length);

    if (rest === '' && method === 'GET') return this.json(200, { full_name: 'me/zmk-config', default_branch: 'main', html_url: 'https://github.com/me/zmk-config' });
    if (rest === '/git/ref/heads/main') return this.json(200, { object: { sha: this.headSha } });
    if (rest.startsWith('/git/commits/') && method === 'GET') {
      const commit = this.commits.get(rest.slice('/git/commits/'.length));
      return commit ? this.json(200, { sha: rest.slice(13), tree: { sha: commit.tree } }) : this.json(404, { message: 'Not Found' });
    }
    if (rest.startsWith('/git/trees/') && method === 'GET') {
      const tree = this.headTree();
      return this.json(200, {
        tree: Object.keys(tree).map((p) => ({ path: p, type: 'blob', sha: `blob:${p}` })),
        truncated: false,
      });
    }
    if (rest.startsWith('/git/blobs/')) {
      const file = decodeURIComponent(rest.slice('/git/blobs/'.length)).replace(/^blob:/, '');
      const content = this.headTree()[file];
      if (content === undefined) return this.json(404, { message: 'Not Found' });
      const bytes = new TextEncoder().encode(content);
      return this.json(200, { encoding: 'base64', content: btoa(String.fromCharCode(...bytes)) });
    }
    if (rest === '/git/trees' && method === 'POST') {
      const base = this.trees.get(body.base_tree) ?? {};
      const next = { ...base };
      for (const entry of body.tree) next[entry.path] = entry.content;
      const same = JSON.stringify(Object.entries(next).sort()) === JSON.stringify(Object.entries(base).sort());
      const sha = same ? body.base_tree : `tree-${++this.counter}`;
      this.trees.set(sha, next);
      return this.json(201, { sha });
    }
    if (rest === '/git/commits' && method === 'POST') {
      const sha = `commit-${++this.counter}`;
      this.commits.set(sha, { tree: body.tree, parents: body.parents, message: body.message });
      return this.json(201, { sha });
    }
    if (rest === '/git/refs/heads/main' && method === 'PATCH') {
      if (body.sha && this.commits.get(body.sha)?.parents[0] !== this.headSha) return this.json(422, { message: 'Update is not a fast forward' });
      this.headSha = body.sha;
      this.onCommit?.(body.sha);
      return this.json(200, { object: { sha: body.sha } });
    }
    if (rest === '/actions/runs' && method === 'GET') {
      const sha = url.searchParams.get('head_sha');
      const branch = url.searchParams.get('branch');
      const runs = this.runs.filter((r) => (!sha || r.head_sha === sha) && (!branch || branch === 'main'));
      return this.json(200, { workflow_runs: [...runs].reverse() });
    }
    const runMatch = /^\/actions\/runs\/(\d+)(\/artifacts)?$/.exec(rest);
    if (runMatch) {
      const run = this.runs.find((r) => r.id === Number(runMatch[1]));
      if (!run) return this.json(404, { message: 'Not Found' });
      if (runMatch[2]) {
        return this.json(200, {
          artifacts: run.artifacts.map((a) => ({
            id: a.id,
            name: a.name,
            archive_download_url: `https://api.github.com${repo}/actions/artifacts/${a.id}/zip`,
          })),
        });
      }
      return this.json(200, { ...run, artifacts: undefined });
    }
    const artifactMatch = /^\/actions\/artifacts\/(\d+)\/zip$/.exec(rest);
    if (artifactMatch) {
      if (this.blockArtifactDownload) throw new TypeError('Failed to fetch');
      const artifact = this.runs.flatMap((r) => r.artifacts).find((a) => a.id === Number(artifactMatch[1]));
      return artifact ? new Response(artifact.zip.slice().buffer, { status: 200 }) : this.json(404, { message: 'Not Found' });
    }
    return this.json(404, { message: `Not Found: ${method} ${rest}` });
  };
}
