export interface RepoRef {
  owner: string;
  repo: string;
  branch: string;
}

export class GitHubError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

const API = 'https://api.github.com';

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** A small GitHub REST client. `fetch` is injectable for tests. */
export class GitHubClient {
  private readonly token: string;
  private readonly fetchImpl: Fetch;

  constructor(token: string, fetchImpl: Fetch = (input, init) => fetch(input, init)) {
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', ...extra };
  }

  /** JSON request to an API path like `/repos/o/r`. */
  async request<T>(path: string, init: { method?: string; body?: unknown; what?: string } = {}): Promise<T> {
    const response = await this.fetchImpl(`${API}${path}`, {
      method: init.method ?? 'GET',
      headers: this.headers(init.body ? { 'Content-Type': 'application/json' } : {}),
      body: init.body === undefined ? null : JSON.stringify(init.body),
    });
    if (!response.ok) throw await toError(response, init.what ?? path);
    return (await response.json()) as T;
  }

  /** Raw bytes from a full URL (artifact downloads). Network/CORS failures reject with a TypeError. */
  async download(url: string): Promise<Uint8Array> {
    const response = await this.fetchImpl(url, { headers: this.headers() });
    if (!response.ok) throw await toError(response, url);
    return new Uint8Array(await response.arrayBuffer());
  }

  getRepo(ref: Pick<RepoRef, 'owner' | 'repo'>) {
    return this.request<{ full_name: string; default_branch: string; html_url: string }>(
      `/repos/${ref.owner}/${ref.repo}`,
      { what: `${ref.owner}/${ref.repo}` },
    );
  }
}

async function toError(response: Response, what: string): Promise<GitHubError> {
  let detail = '';
  try {
    detail = ((await response.json()) as { message?: string }).message ?? '';
  } catch {
    // Not JSON.
  }
  switch (response.status) {
    case 401:
      return new GitHubError(401, 'GitHub said the token was rejected: it may be mistyped, expired or revoked.');
    case 403:
      if (response.headers.get('x-ratelimit-remaining') === '0') {
        return new GitHubError(403, 'GitHub rate limit reached. Wait a few minutes and try again.');
      }
      return new GitHubError(403, `The token is missing a permission for ${what}. ${detail}`.trim());
    case 404:
      return new GitHubError(404, `GitHub couldn't find ${what}, or the token can't see it.`);
    default:
      return new GitHubError(response.status, `GitHub error ${response.status} for ${what}: ${detail || response.statusText}`);
  }
}
