import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { lineDiff } from './diff.ts';
import { GitHubClient, GitHubError } from './client.ts';
import { ArtifactDownloadError, downloadFirmware, findLatestRun, waitForRun } from './builds.ts';
import { extractUf2 } from './firmware.ts';
import { FakeGitHub, type FakeRun } from './fakeGitHub.ts';
import { commitFiles, createRepo, loadRepoFiles } from './repo.ts';

const REPO = { owner: 'me', repo: 'zmk-config', branch: 'main' };

const setup = () => {
  const fake = new FakeGitHub({ 'config/lily58.keymap': 'keymap ä', 'config/west.yml': 'west', 'README.md': 'readme' });
  return { fake, client: new GitHubClient('good-token', fake.fetch) };
};

describe('GitHubClient', () => {
  it('explains a bad token', async () => {
    const { fake } = setup();
    const client = new GitHubClient('bad', fake.fetch);
    const error = await client.getRepo(REPO).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubError);
    expect((error as GitHubError).message).toMatch(/token was rejected/);
  });

  it('explains a missing repo', async () => {
    const { client } = setup();
    await expect(client.getRepo({ ...REPO, repo: 'nope' })).rejects.toThrow(/couldn't find me\/nope/);
  });
});

describe('repo files', () => {
  it('loads text files (UTF-8) from the branch', async () => {
    const { client } = setup();
    const { files, headSha } = await loadRepoFiles(client, REPO, (path) => path.startsWith('config/'));
    expect(files).toEqual({ 'config/lily58.keymap': 'keymap ä', 'config/west.yml': 'west' });
    expect(headSha).toBe('commit-0');
  });

  it('commits changed files on top of the branch', async () => {
    const { fake, client } = setup();
    const result = await commitFiles(client, REPO, { 'config/west.yml': 'west v0.3', 'build.yaml': 'new' }, 'Update');
    expect(result).toEqual({ committed: true, sha: 'commit-2' });
    expect(fake.headSha).toBe('commit-2');
    expect(fake.trees.get('tree-1')).toEqual({
      'config/lily58.keymap': 'keymap ä',
      'config/west.yml': 'west v0.3',
      'README.md': 'readme',
      'build.yaml': 'new',
    });
  });

  it('reads an empty repository as having no files yet', async () => {
    const fake = FakeGitHub.empty();
    const client = new GitHubClient('good-token', fake.fetch);
    expect(await loadRepoFiles(client, REPO, () => true)).toEqual({ files: {}, headSha: null });
  });

  it('makes the first commit of an empty repository, then adds the rest on top', async () => {
    const fake = FakeGitHub.empty();
    const client = new GitHubClient('good-token', fake.fetch);
    const result = await commitFiles(client, REPO, { 'config/west.yml': 'west ä', 'build.yaml': 'b', 'gone.txt': null }, 'First');
    expect(result.committed).toBe(true);
    expect(fake.headSha).toBe(result.sha);
    expect(fake.headFiles()).toEqual({ 'config/west.yml': 'west ä', 'build.yaml': 'b' });
    // The first file goes in through the Contents API, which works on an empty repo.
    expect(fake.requests.some((r) => r.method === 'PUT' && r.path === '/repos/me/zmk-config/contents/config/west.yml')).toBe(true);
  });

  it('makes no commit when nothing changed', async () => {
    const { fake, client } = setup();
    const result = await commitFiles(client, REPO, { 'config/west.yml': 'west' }, 'Nothing');
    expect(result).toEqual({ committed: false, sha: 'commit-0' });
    expect(fake.requests.some((r) => r.method === 'PATCH')).toBe(false);
  });
});

describe('createRepo', () => {
  it('creates a repository for the user, started with a README', async () => {
    const { fake, client } = setup();
    const created = await createRepo(client, { name: 'my-zmk', private: true });
    expect(created).toEqual({ owner: 'me', repo: 'my-zmk', defaultBranch: 'main', private: true });
    const request = fake.requests.find((r) => r.method === 'POST' && r.path === '/user/repos');
    expect(request?.body).toMatchObject({ name: 'my-zmk', private: true, auto_init: true });
  });

  it('explains a name that is taken and a missing permission', async () => {
    const { client } = setup();
    await expect(createRepo(client, { name: 'zmk-config', private: false })).rejects.toThrow(/already have a repository named zmk-config/);
    const noRights = new FakeGitHub({});
    noRights.canCreateRepos = false;
    await expect(createRepo(new GitHubClient('good-token', noRights.fetch), { name: 'x', private: false })).rejects.toThrow(
      /can't create repositories/,
    );
  });
});

const uf2Zip = zipSync({ 'lily58_left-nice_nano_v2-zmk.uf2': strToU8('L'), 'lily58_right-nice_nano_v2-zmk.uf2': strToU8('R') });

const run = (patch: Partial<FakeRun>): FakeRun => ({
  id: 7,
  head_sha: 'commit-2',
  status: 'queued',
  conclusion: null,
  html_url: 'https://github.com/me/zmk-config/actions/runs/7',
  artifacts: [{ id: 70, name: 'firmware', zip: uf2Zip }],
  ...patch,
});

describe('builds', () => {
  it('waits for the run of a commit and reports progress', async () => {
    const { fake, client } = setup();
    const statuses: string[] = [];
    let polls = 0;
    const sleep = async () => {
      polls++;
      if (polls === 2) fake.runs = [run({ status: 'in_progress' })];
      if (polls === 3) fake.runs = [run({ status: 'completed', conclusion: 'success' })];
    };
    const result = await waitForRun(client, REPO, 'commit-2', { sleep, onUpdate: (r) => statuses.push(r?.status ?? 'waiting') });
    expect(result.conclusion).toBe('success');
    expect(statuses).toEqual(['waiting', 'waiting', 'in_progress', 'completed']);
  });

  it('gives up after the timeout', async () => {
    const { client } = setup();
    let now = 0;
    const promise = waitForRun(client, REPO, 'commit-2', { sleep: async () => void (now += 60_000), now: () => now, timeoutMs: 120_000 });
    await expect(promise).rejects.toThrow(/didn't start/);
  });

  it('finds the latest run on the branch', async () => {
    const { fake, client } = setup();
    fake.runs = [run({ id: 1 }), run({ id: 2 })];
    expect((await findLatestRun(client, REPO))?.id).toBe(2);
  });

  it('downloads the firmware and extracts the .uf2 files', async () => {
    const { fake, client } = setup();
    fake.runs = [run({ status: 'completed', conclusion: 'success' })];
    const files = await downloadFirmware(client, REPO, 7);
    expect(files.map((f) => [f.name, new TextDecoder().decode(f.data)])).toEqual([
      ['lily58_left-nice_nano_v2-zmk.uf2', 'L'],
      ['lily58_right-nice_nano_v2-zmk.uf2', 'R'],
    ]);
  });

  it('explains a blocked download and links to the run', async () => {
    const { fake, client } = setup();
    fake.runs = [run({ status: 'completed', conclusion: 'success' })];
    fake.blockArtifactDownload = true;
    const error = await downloadFirmware(client, REPO, 7).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ArtifactDownloadError);
    expect((error as ArtifactDownloadError).runUrl).toBe('https://github.com/me/zmk-config/actions/runs/7');
  });
});

describe('extractUf2', () => {
  it('finds .uf2 files, also inside nested zips', () => {
    const inner = zipSync({ 'right.uf2': strToU8('R') });
    const outer = zipSync({ 'left.uf2': strToU8('L'), 'artifact-right.zip': inner, 'notes.txt': strToU8('x') });
    expect(extractUf2(outer).map((f) => f.name)).toEqual(['left.uf2', 'right.uf2']);
  });
});

describe('lineDiff', () => {
  it('marks added and removed lines', () => {
    expect(lineDiff('a\nb\nc\n', 'a\nc\nd\n')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'same', text: 'c' },
      { kind: 'added', text: 'd' },
    ]);
  });

  it('treats a missing file as all added', () => {
    expect(lineDiff(undefined, 'x\n')).toEqual([{ kind: 'added', text: 'x' }]);
  });

  it('deletes files given as null', async () => {
    const { fake, client } = setup();
    const result = await commitFiles(client, REPO, { 'build.yaml': 'new', 'README.md': null }, 'Delete');
    expect(result.committed).toBe(true);
    expect(fake.trees.get('tree-1')).toEqual({ 'config/lily58.keymap': 'keymap ä', 'config/west.yml': 'west', 'build.yaml': 'new' });
  });
});
