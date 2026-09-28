import { GitHubError, type GitHubClient } from './client.ts';
import { isConfigFile, loadRepoFiles } from './repo.ts';

export interface RepoInput {
  owner: string;
  repo: string;
  /** Absent: the repo's default branch. */
  branch?: string;
}

const NAME = /^[A-Za-z0-9_.-]+$/;

/**
 * Reads `owner/repo`, or a GitHub link to a repo or one of its branches
 * (`https://github.com/owner/repo/tree/branch`). Null when it isn't one.
 */
export function parseRepoInput(input: string): RepoInput | null {
  const text = input
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^(www\.)?github\.com\//, '')
    .replace(/\/+$/, '');
  if (/^[^/]+\.[a-z]+\//i.test(text)) return null; // another host, e.g. gitlab.com/…
  const [owner = '', rawRepo = '', tree, ...branchParts] = text.split('/');
  const repo = rawRepo.replace(/\.git$/, '');
  if (!NAME.test(owner) || !NAME.test(repo)) return null;
  if (tree === undefined) return { owner, repo };
  if (tree !== 'tree' || branchParts.length === 0) return null;
  return { owner, repo, branch: branchParts.join('/') };
}

export interface PublicRepo {
  owner: string;
  repo: string;
  branch: string;
  /** The config files, by path. */
  files: Record<string, string>;
}

/**
 * Reads a public zmk-config repo's config files without logging in. Errors
 * explain what went wrong in terms of opening a public repo.
 */
export async function openPublicRepo(client: GitHubClient, input: RepoInput): Promise<PublicRepo> {
  const name = `${input.owner}/${input.repo}`;
  try {
    const info = await client.getRepo(input);
    const branch = input.branch || info.default_branch;
    const { files } = await loadRepoFiles(client, { owner: input.owner, repo: input.repo, branch }, isConfigFile);
    if (!Object.keys(files).some((path) => /^config\/[^/]+\.keymap$/.test(path))) {
      throw new Error(`${name} (${branch}) has no config/*.keymap. Is it a zmk-config repository?`);
    }
    if (!('config/west.yml' in files)) {
      throw new Error(`${name} (${branch}) has no config/west.yml, which every zmk-config needs.`);
    }
    return { owner: input.owner, repo: input.repo, branch, files };
  } catch (error) {
    if (!(error instanceof GitHubError)) throw error;
    if (error.status === 403 || error.status === 429) {
      throw new Error(
        'GitHub allows 60 requests an hour without logging in, and that limit is used up. Try again later, or connect on the Build tab.',
        { cause: error },
      );
    }
    if (error.status === 404 || error.status === 401) {
      const what = input.branch ? `${name} with a branch ${input.branch}` : name;
      throw new Error(`Couldn't find ${what}. Check the name; a private repository needs you to connect on the Build tab.`, {
        cause: error,
      });
    }
    throw error;
  }
}
