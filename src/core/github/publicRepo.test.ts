import { describe, expect, it } from 'vitest';
import { GitHubClient } from './client.ts';
import { FakeGitHub } from './fakeGitHub.ts';
import { openPublicRepo, parseRepoInput } from './publicRepo.ts';

describe('parseRepoInput', () => {
  it('reads owner/repo and GitHub links', () => {
    expect(parseRepoInput('me/zmk-config')).toEqual({ owner: 'me', repo: 'zmk-config' });
    expect(parseRepoInput(' https://github.com/me/zmk-config ')).toEqual({ owner: 'me', repo: 'zmk-config' });
    expect(parseRepoInput('github.com/me/zmk-config.git')).toEqual({ owner: 'me', repo: 'zmk-config' });
    expect(parseRepoInput('https://github.com/me/zmk-config/')).toEqual({ owner: 'me', repo: 'zmk-config' });
  });

  it('takes the branch from a /tree/ link', () => {
    expect(parseRepoInput('https://github.com/me/zmk-config/tree/corne')).toEqual({ owner: 'me', repo: 'zmk-config', branch: 'corne' });
    expect(parseRepoInput('https://github.com/me/zmk-config/tree/feature/x')).toEqual({
      owner: 'me',
      repo: 'zmk-config',
      branch: 'feature/x',
    });
  });

  it('rejects anything else', () => {
    expect(parseRepoInput('')).toBeNull();
    expect(parseRepoInput('zmk-config')).toBeNull();
    expect(parseRepoInput('https://gitlab.com/me/zmk-config')).toBeNull();
    expect(parseRepoInput('me/zmk config')).toBeNull();
  });
});

const KEYMAP = `#include <behaviors.dtsi>
/ { keymap { compatible = "zmk,keymap"; base { bindings = <&kp A &kp B>; }; }; };`;

const setup = (files: Record<string, string> = { 'config/pad.keymap': KEYMAP, 'config/west.yml': 'manifest: {}', 'README.md': 'hi' }) => {
  const fake = new FakeGitHub(files);
  fake.isPublic = true;
  return { fake, client: new GitHubClient('', fake.fetch) };
};

describe('openPublicRepo', () => {
  it('loads the config files of a public repo without a token', async () => {
    const { client } = setup();
    const opened = await openPublicRepo(client, { owner: 'me', repo: 'zmk-config' });
    expect(opened.branch).toBe('main');
    expect(Object.keys(opened.files).sort()).toEqual(['config/pad.keymap', 'config/west.yml']);
  });

  it('explains a missing or private repo', async () => {
    const { client } = setup();
    await expect(openPublicRepo(client, { owner: 'me', repo: 'nope' })).rejects.toThrow(
      /Couldn't find me\/nope\. Check the name; a private repository needs you to connect on the Build & flash tab/,
    );
  });

  it('explains a repo without a keymap', async () => {
    const { client } = setup({ 'README.md': 'hi' });
    await expect(openPublicRepo(client, { owner: 'me', repo: 'zmk-config' })).rejects.toThrow(
      /me\/zmk-config \(main\) has no config\/\*\.keymap/,
    );
  });

  it('explains a repo without a west.yml', async () => {
    const { client } = setup({ 'config/pad.keymap': KEYMAP });
    await expect(openPublicRepo(client, { owner: 'me', repo: 'zmk-config' })).rejects.toThrow(/has no config\/west\.yml/);
  });

  it('explains the rate limit', async () => {
    const { fake, client } = setup();
    fake.rateLimited = true;
    await expect(openPublicRepo(client, { owner: 'me', repo: 'zmk-config' })).rejects.toThrow(/60 requests an hour/);
  });
});
