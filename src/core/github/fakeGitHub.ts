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
  /** Null while the repository is empty (no commits yet). */
  headSha: string | null = 'commit-0';
  commits = new Map<string, Commit>();
  trees = new Map<string, Record<string, string>>();
  runs: FakeRun[] = [];
  requests: { method: string; path: string; body?: unknown }[] = [];
  /** Called after each commit, e.g. to start a run. */
  onCommit?: (sha: string) => void;
  /** Simulates the browser blocking the artifact redirect. */
  blockArtifactDownload = false;
  /** Answers requests without a token, like a public repo. */
  isPublic = false;
  /** Answers every request with GitHub's rate-limit error. */
  rateLimited = false;
  /** Whether the app may create repositories (it needs the Administration permission). */
  canCreateRepos = true;
  /** False until the editor creates me/zmk-config (then it has just a README, like auto_init). */
  exists = true;
  private counter = 0;

  constructor(files: Record<string, string>) {
    this.files = files;
    this.trees.set('tree-0', { ...files });
    this.commits.set('commit-0', { tree: 'tree-0', parents: [], message: 'initial' });
  }

  /** A repository with no commits yet, like one just created on GitHub without a README. */
  static empty(): FakeGitHub {
    const fake = new FakeGitHub({});
    fake.headSha = null;
    fake.commits.clear();
    fake.trees.clear();
    return fake;
  }

  /** The files at the branch head. */
  headFiles(): Record<string, string> {
    return { ...this.headTree() };
  }

  private json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }

  private headTree(): Record<string, string> {
    const commit = this.headSha === null ? undefined : this.commits.get(this.headSha);
    return this.trees.get(commit?.tree ?? '') ?? {};
  }

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const path = url.pathname;
    this.requests.push({ method, path, body });
    const auth = new Headers(init?.headers).get('Authorization');
    if (this.rateLimited) {
      return new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'x-ratelimit-remaining': '0' },
      });
    }
    // A public repo answers anonymous requests too.
    if (!(this.isPublic && auth === null) && auth !== `Bearer ${this.token}`) return this.json(401, { message: 'Bad credentials' });
    const repo = '/repos/me/zmk-config';
    if (path === '/user') return this.json(200, { login: 'me', avatar_url: 'https://avatars.githubusercontent.com/u/1' });
    if (path === '/user/installations') return this.json(200, { installations: [{ id: 5 }] });
    if (path === '/user/installations/5/repositories') {
      return this.json(200, {
        total_count: 2,
        repositories: [
          { name: 'zmk-config', owner: { login: 'me' }, default_branch: 'main', private: false },
          { name: 'another', owner: { login: 'me' }, default_branch: 'master', private: true },
        ],
      });
    }
    if (path === '/user/repos' && method === 'POST') {
      if (!this.canCreateRepos) return this.json(403, { message: 'Resource not accessible by integration' });
      if (body.name === 'zmk-config' && this.exists) {
        return this.json(422, { message: 'Repository creation failed.', errors: [{ message: 'name already exists on this account' }] });
      }
      if (body.name === 'zmk-config') {
        this.exists = true;
        this.trees.set('tree-0', { 'README.md': '# zmk-config' });
        this.commits.set('commit-0', { tree: 'tree-0', parents: [], message: 'Initial commit' });
        this.headSha = 'commit-0';
      }
      return this.json(201, {
        name: body.name,
        owner: { login: 'me' },
        default_branch: 'main',
        private: Boolean(body.private),
        html_url: `https://github.com/me/${body.name}`,
      });
    }
    if (path === `${repo}/branches`) return this.json(200, this.headSha === null ? [] : [{ name: 'main' }, { name: 'editor-test' }]);
    if (!path.startsWith(repo) || !this.exists) return this.json(404, { message: 'Not Found' });
    const rest = path.slice(repo.length);

    if (rest === '' && method === 'GET') return this.json(200, { full_name: 'me/zmk-config', default_branch: 'main', html_url: 'https://github.com/me/zmk-config' });
    if (this.headSha === null && rest.startsWith('/git/')) return this.json(409, { message: 'Git Repository is empty.' });
    if (rest === '/git/ref/heads/main') return this.json(200, { object: { sha: this.headSha } });
    if (rest.startsWith('/contents/') && method === 'PUT') {
      const file = rest.slice('/contents/'.length);
      const bytes = Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0));
      const tree = `tree-${++this.counter}`;
      this.trees.set(tree, { ...this.headTree(), [file]: new TextDecoder().decode(bytes) });
      const sha = `commit-${++this.counter}`;
      this.commits.set(sha, { tree, parents: this.headSha === null ? [] : [this.headSha], message: body.message });
      this.headSha = sha;
      this.onCommit?.(sha);
      return this.json(201, { commit: { sha } });
    }
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
      const merged = new Map(Object.entries(base));
      for (const entry of body.tree) {
        if (entry.sha === null) merged.delete(entry.path);
        else merged.set(entry.path, entry.content);
      }
      const next: Record<string, string> = Object.fromEntries(merged);
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
