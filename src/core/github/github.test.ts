import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { lineDiff } from './diff.ts';
import { GitHubClient, GitHubError } from './client.ts';
import { ArtifactDownloadError, buildFailure, downloadFirmware, errorLines, findLatestRun, waitForRun } from './builds.ts';
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
    const put = fake.requests.find((r) => r.method === 'PUT' && r.path === '/repos/me/zmk-config/contents/config/west.yml');
    // On the chosen branch, not whatever the default is.
    expect(put?.body).toMatchObject({ branch: 'main' });
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

describe('build failures', () => {
  const LOG = [
    '2026-09-30T10:00:01.1234567Z -- west build: generating a build system',
    "2026-09-30T10:00:02.0000000Z \u001b[31mdevicetree error: /keymap/base: undefined node label 'nav_layer'\u001b[0m",
    "2026-09-30T10:00:02.0000000Z devicetree error: /keymap/base: undefined node label 'nav_layer'",
    '2026-09-30T10:00:03.0000000Z cc1: all warnings being treated as errors -Werror',
    '2026-09-30T10:00:04.0000000Z ##[error]Process completed with exit code 1.',
  ].join('\n');
  const failedRun = run({
    id: 8,
    status: 'completed',
    conclusion: 'failure',
    jobs: [
      { id: 81, name: 'build / Build ZMK firmware (lily58_left)', conclusion: 'failure', steps: [{ name: 'West Build (lily58_left)', conclusion: 'failure' }], log: LOG },
      { id: 82, name: 'build / Build ZMK firmware (lily58_right)', conclusion: 'success', steps: [], log: '' },
    ],
  });

  it('keeps the lines that say what went wrong', () => {
    // GitHub's own "exit code 1" says nothing about why, so only the real error is kept.
    expect(errorLines(LOG)).toEqual(["devicetree error: /keymap/base: undefined node label 'nav_layer'"]);
  });

  it('skips build chatter and keeps the Kconfig warnings that stop a build', () => {
    const log = [
      '-- Found devicetree overlay: /config/lily58.keymap',
      'Cache not found for input keys: zephyr-abc',
      'warning: UNKNOWN_SETTING (defined at Kconfig:1) was assigned the value y but got the value n',
      'error: Aborting due to Kconfig warnings',
      "main.c:10:5: error: implicit declaration of function 'foo' [-Werror=implicit-function-declaration]",
    ].join('\n');
    expect(errorLines(log)).toEqual([
      'warning: UNKNOWN_SETTING (defined at Kconfig:1) was assigned the value y but got the value n',
      'error: Aborting due to Kconfig warnings',
      "main.c:10:5: error: implicit declaration of function 'foo' [-Werror=implicit-function-declaration]",
    ]);
  });

  it('names the failed job and step, with a hint and the error lines', async () => {
    const { fake, client } = setup();
    fake.runs.push(failedRun);
    const [job, ...rest] = await buildFailure(client, REPO, 8);
    expect(rest).toEqual([]);
    expect(job).toMatchObject({ name: 'Build ZMK firmware (lily58_left)', step: 'West Build (lily58_left)' });
    expect(job?.hint).toMatch(/devicetree/);
    expect(job?.lines[0]).toMatch(/undefined node label/);
    expect(job?.url).toContain('/job/81');
  });

  it('still names the job when the browser can’t read the log', async () => {
    const { fake, client } = setup();
    fake.runs.push(failedRun);
    fake.blockLogDownload = true;
    const [job] = await buildFailure(client, REPO, 8);
    expect(job).toMatchObject({ step: 'West Build (lily58_left)', lines: [] });
    expect(job?.hint).toMatch(/couldn’t compile/);
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
