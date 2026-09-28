import type { GitHubClient, RepoRef } from './client.ts';

const repoPath = (ref: RepoRef) => `/repos/${ref.owner}/${ref.repo}`;

function decodeBase64(content: string): string {
  const binary = atob(content.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

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
): Promise<{ files: Record<string, string>; headSha: string }> {
  const head = await headCommit(client, ref);
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
  const head = await headCommit(client, ref);
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
