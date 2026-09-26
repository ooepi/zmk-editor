import type { GitHubClient } from './client.ts';

/** The GitHub topic ZMK module authors tag their repos with. */
export const MODULE_TOPIC = 'zmk-module';

export interface ModuleSearchResult {
  owner: string;
  repo: string;
  description: string;
  stars: number;
  url: string;
  /** ISO date of the last push. */
  pushedAt: string;
  archived: boolean;
}

interface SearchResponse {
  total_count: number;
  items: {
    name: string;
    owner: { login: string };
    description: string | null;
    stargazers_count: number;
    html_url: string;
    pushed_at: string;
    archived: boolean;
  }[];
}

/** Repos tagged `zmk-module` matching `query` (all of them when empty), most starred first. */
export async function searchModules(client: GitHubClient, query: string): Promise<{ total: number; results: ModuleSearchResult[] }> {
  const q = encodeURIComponent(`topic:${MODULE_TOPIC} ${query.trim()}`.trim());
  const response = await client.request<SearchResponse>(`/search/repositories?q=${q}&sort=stars&order=desc&per_page=30`, {
    what: 'module search',
  });
  return {
    total: response.total_count,
    results: response.items.map((item) => ({
      owner: item.owner.login,
      repo: item.name,
      description: item.description ?? '',
      stars: item.stargazers_count,
      url: item.html_url,
      pushedAt: item.pushed_at,
      archived: item.archived,
    })),
  };
}

export interface ModuleInspection {
  owner: string;
  repo: string;
  url: string;
  description: string;
  /** The ref to use; undefined when a tag named like the ZMK version exists (the module follows ZMK). */
  revision?: string;
  /** How the revision was chosen, for the user. */
  revisionNote: string;
  /** True when no tag matched the ZMK version and the default branch is used. */
  untagged: boolean;
  /** Whether the repo has `zephyr/module.yml`, i.e. is a Zephyr/ZMK module at all. */
  isModule: boolean;
  /** Keymap headers it provides, e.g. `behaviors/foo.dtsi`. */
  includes: string[];
  /** Behavior compatibles it implements, e.g. `zmk,behavior-foo`. */
  compatibles: string[];
  /** Shields it provides (for `build.yaml`). */
  shields: string[];
}

/** Picks the ref for a ZMK version from a repo's tags: `v0.3`, else the newest `v0.3.x`. */
export function pickRevision(tags: string[], zmkVersion: string): string | undefined {
  if (tags.includes(zmkVersion)) return zmkVersion;
  const patch = (tag: string) => Number(tag.slice(zmkVersion.length + 1));
  const patches = tags.filter((t) => t.startsWith(`${zmkVersion}.`) && Number.isInteger(patch(t)));
  return patches.sort((a, b) => patch(b) - patch(a))[0];
}

/** Reads what a module repo offers and which revision matches the ZMK version. */
export async function inspectModule(client: GitHubClient, owner: string, repo: string, zmkVersion: string): Promise<ModuleInspection> {
  const what = `${owner}/${repo}`;
  const info = await client.request<{ name: string; owner: { login: string }; default_branch: string; html_url: string; description: string | null }>(
    `/repos/${owner}/${repo}`,
    { what },
  );
  const tags = (await client.request<{ name: string }[]>(`/repos/${owner}/${repo}/tags?per_page=100`, { what: `${what} tags` })).map(
    (t) => t.name,
  );
  const tag = pickRevision(tags, zmkVersion);
  const ref = tag ?? info.default_branch;
  const tree = await client.request<{ tree: { path: string; type: string }[] }>(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    { what: `${what} files` },
  );
  const paths = tree.tree.map((t) => t.path);
  const match = (pattern: RegExp) => [...new Set(paths.flatMap((p) => pattern.exec(p)?.[1] ?? []))].sort();

  const inspection: ModuleInspection = {
    owner: info.owner.login,
    repo: info.name,
    url: info.html_url,
    description: info.description ?? '',
    revisionNote: tag
      ? tag === zmkVersion
        ? `Follows ZMK ${zmkVersion} (it has a ${zmkVersion} tag).`
        : `Pinned to ${tag}, its release for ZMK ${zmkVersion}.`
      : `No release tag for ZMK ${zmkVersion}; uses its ${info.default_branch} branch, which may target a different ZMK version.`,
    untagged: !tag,
    isModule: paths.includes('zephyr/module.yml') || paths.includes('zephyr/module.yaml'),
    includes: match(/^dts\/(behaviors\/[^/]+\.dtsi)$/),
    compatibles: match(/^dts\/bindings\/(?:.*\/)?(zmk,behavior-[^/]+)\.ya?ml$/),
    shields: match(/^boards\/shields\/([^/]+)\/Kconfig\.shield$/),
  };
  if (tag !== zmkVersion) inspection.revision = ref;
  return inspection;
}
