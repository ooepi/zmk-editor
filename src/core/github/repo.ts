import { GitHubError, type GitHubClient, type RepoRef } from './client.ts';
import type { UserRepo } from './oauth.ts';

const repoPath = (ref: RepoRef) => `/repos/${ref.owner}/${ref.repo}`;

function decodeBase64(content: string): string {
  const binary = atob(content.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** GitHub answers 409 for Git data requests on a repository with no commits yet. */
const isEmptyRepo = (error: unknown) => error instanceof GitHubError && error.status === 409;

async function headCommit(client: GitHubClient, ref: RepoRef): Promise<{ sha: string; tree: string }> {
  const head = await client.request<{ object: { sha: string } }>(`${repoPath(ref)}/git/ref/heads/${ref.branch}`, {
    what: `branch ${ref.branch}`,
  });
  const commit = await client.request<{ tree: { sha: string } }>(`${repoPath(ref)}/git/commits/${head.object.sha}`);
  return { sha: head.object.sha, tree: commit.tree.sha };
}

/** The files of a zmk-config repo the editor reads and writes. */
export const isConfigFile = (path: string) =>
  /^config\/[^/]+\.(keymap|conf)$/.test(path) ||
  path.startsWith('config/boards/shields/') ||
  ['config/west.yml', 'config/info.json', 'build.yaml', '.github/workflows/build.yml'].includes(path);

/** Reads the text files the filter picks from the branch head. */
export async function loadRepoFiles(
  client: GitHubClient,
  ref: RepoRef,
  include: (path: string) => boolean,
): Promise<{ files: Record<string, string>; headSha: string | null }> {
  let head;
  try {
    head = await headCommit(client, ref);
  } catch (error) {
    // A brand-new repository: nothing to read yet, and the first commit will fill it.
    if (isEmptyRepo(error)) return { files: {}, headSha: null };
    throw error;
  }
  const tree = await client.request<{ tree: { path: string; type: string; sha: string }[]; truncated: boolean }>(
    `${repoPath(ref)}/git/trees/${head.tree}?recursive=1`,
  );
  const wanted = tree.tree.filter((entry) => entry.type === 'blob' && include(entry.path));
  const blobs = await Promise.all(
    wanted.map((entry) =>
      client.request<{ content: string; encoding: string }>(`${repoPath(ref)}/git/blobs/${encodeURIComponent(entry.sha)}`),
    ),
  );
  const files: Record<string, string> = {};
  wanted.forEach((entry, i) => {
    const blob = blobs[i];
    if (blob) files[entry.path] = blob.encoding === 'base64' ? decodeBase64(blob.content) : blob.content;
  });
  return { files, headSha: head.sha };
}

export type CommitResult = { committed: true; sha: string } | { committed: false; sha: string };

/**
 * Commits `files` on top of the branch head as one commit (Git Data API).
 * No commit is made when the files already match.
 */
export async function commitFiles(
  client: GitHubClient,
  ref: RepoRef,
  /** Path to new content; null deletes the path. */
  files: Record<string, string | null>,
  message: string,
): Promise<CommitResult> {
  let head;
  try {
    head = await headCommit(client, ref);
  } catch (error) {
    if (!isEmptyRepo(error)) throw error;
    return firstCommit(client, ref, files, message);
  }
  const tree = await client.request<{ sha: string }>(`${repoPath(ref)}/git/trees`, {
    method: 'POST',
    body: {
      base_tree: head.tree,
      tree: Object.entries(files).map(([path, content]) => ({ path, mode: '100644', type: 'blob', ...(content === null ? { sha: null } : { content }) })),
    },
    what: 'the files (does the token have Contents: read and write, and Workflows: read and write?)',
  });
  if (tree.sha === head.tree) return { committed: false, sha: head.sha };
  const commit = await client.request<{ sha: string }>(`${repoPath(ref)}/git/commits`, {
    method: 'POST',
    body: { message, tree: tree.sha, parents: [head.sha] },
  });
  await client.request(`${repoPath(ref)}/git/refs/heads/${ref.branch}`, {
    method: 'PATCH',
    body: { sha: commit.sha, force: false },
    what: `branch ${ref.branch} (changing .github/workflows needs the Workflows: read and write permission)`,
  });
  return { committed: true, sha: commit.sha };
}

/**
 * The first commit of an empty repository. The Git Data API needs an existing commit, so one file
 * goes in through the Contents API (which creates the default branch), then the rest on top of it.
 */
async function firstCommit(client: GitHubClient, ref: RepoRef, files: Record<string, string | null>, message: string): Promise<CommitResult> {
  const written = Object.entries(files).filter((entry): entry is [string, string] => entry[1] !== null);
  const [first, ...rest] = written;
  if (!first) throw new GitHubError(409, 'The repository is empty and there are no files to commit.');
  const [path, content] = first;
  const result = await client.request<{ commit: { sha: string } }>(`${repoPath(ref)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'PUT',
    body: { message, content: encodeBase64(content) },
    what: 'the first file (does the token have Contents: read and write?)',
  });
  if (rest.length === 0) return { committed: true, sha: result.commit.sha };
  return commitFiles(client, ref, Object.fromEntries(rest), message);
}

/**
 * Creates a repository for the logged-in user, started with a README so it has a branch.
 * GitHub adds a repository an app creates to that app's access.
 */
export async function createRepo(client: GitHubClient, options: { name: string; private: boolean }): Promise<UserRepo> {
  try {
    const repo = await client.request<{ name: string; owner: { login: string }; default_branch: string; private: boolean }>('/user/repos', {
      method: 'POST',
      body: {
        name: options.name,
        private: options.private,
        auto_init: true,
        description: 'ZMK keyboard config, made with ZMK Editor',
      },
      what: 'creating a repository',
    });
    return { owner: repo.owner.login, repo: repo.name, defaultBranch: repo.default_branch, private: repo.private };
  } catch (error) {
    if (error instanceof GitHubError && error.status === 422) {
      throw new GitHubError(422, `You already have a repository named ${options.name}. Pick another name, or open that one.`);
    }
    if (error instanceof GitHubError && error.status === 403) {
      throw new GitHubError(
        403,
        "The editor can't create repositories on your account yet: its GitHub App needs the Administration permission. Create the repository on GitHub instead, then add it here.",
      );
    }
    throw error;
  }
}
