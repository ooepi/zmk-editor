// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeGitHub } from '../core/github/fakeGitHub.ts';
import { App } from './App.tsx';

const KEYMAP = `#include <behaviors.dtsi>
/ { keymap { compatible = "zmk,keymap"; base { bindings = <&kp A &kp B &kp C &kp D>; }; }; };`;

const WEST = `manifest:
  remotes:
    - name: zmkfirmware
      url-base: https://github.com/zmkfirmware
  projects:
    - name: zmk
      remote: zmkfirmware
      revision: v0.3
      import: app/west.yml
  self:
    path: config
`;

let fake: FakeGitHub;

beforeEach(() => {
  localStorage.clear();
  fake = new FakeGitHub({ 'config/pad.keymap': KEYMAP, 'config/west.yml': WEST, 'README.md': 'hi' });
  fake.isPublic = true;
  vi.stubGlobal('fetch', fake.fetch);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const dialog = () => within(screen.getByRole('dialog', { name: 'Open from GitHub' }));

async function openRepo(text: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open from GitHub' }));
  await user.type(dialog().getByRole('textbox', { name: 'Repository' }), text);
  await user.click(dialog().getByRole('button', { name: 'Open' }));
  return user;
}

describe('Open from GitHub', () => {
  it('opens a public repo without logging in, after asking', async () => {
    render(<App />);
    await openRepo('https://github.com/me/zmk-config');
    expect(await screen.findByRole('button', { name: 'Key 3: D' })).toBeTruthy();
    expect(window.confirm).toHaveBeenCalledWith('Replace the editor contents with me/zmk-config (main)?');
    expect(screen.getByRole('status').textContent).toMatch(/Opened me\/zmk-config \(main\)\. To commit changes, connect/);
    expect(screen.queryByRole('dialog', { name: 'Open from GitHub' })).toBeNull();
    expect(fake.requests.length).toBeGreaterThan(0);
  });

  it('keeps the editor as it was when the replacement is declined', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<App />);
    await openRepo('me/zmk-config');
    expect(await screen.findByRole('button', { name: 'Key 0: Esc' })).toBeTruthy();
  });

  it('explains input it cannot read and repos it cannot find', async () => {
    render(<App />);
    const user = await openRepo('zmk-config');
    expect(dialog().getByRole('alert').textContent).toMatch(/Enter a repository like owner\/zmk-config/);

    await user.clear(dialog().getByRole('textbox', { name: 'Repository' }));
    await user.type(dialog().getByRole('textbox', { name: 'Repository' }), 'me/nope');
    await user.click(dialog().getByRole('button', { name: 'Open' }));
    expect((await dialog().findByRole('alert')).textContent).toMatch(/Couldn't find me\/nope/);
  });
});
