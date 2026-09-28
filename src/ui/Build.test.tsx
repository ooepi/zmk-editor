// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateConfig } from '../core/config.ts';
import { FakeGitHub } from '../core/github/fakeGitHub.ts';
import { newHardwareConfig } from '../core/hardware/config.ts';
import { testPad } from '../core/hardware/testFixtures.ts';
import { findSetting, writeSetting } from '../core/catalog/settings.ts';
import { App } from './App.tsx';
import { demoConfig } from './state/demo.ts';

let fake: FakeGitHub;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  // The repo matches the demo except for one key on the base layer.
  const files = generateConfig(demoConfig().config);
  files['config/lily58.keymap'] = (files['config/lily58.keymap'] ?? '').replace('&kp ESC ', '&kp TAB ');
  fake = new FakeGitHub({ ...files, 'README.md': 'hi' });
  fake.onCommit = (sha) => {
    fake.runs.push({
      id: 42,
      head_sha: sha,
      status: 'completed',
      conclusion: 'success',
      html_url: 'https://github.com/me/zmk-config/actions/runs/42',
      artifacts: [{ id: 1, name: 'firmware', zip: zipSync({ 'lily58_left.uf2': strToU8('L'), 'lily58_right.uf2': strToU8('R') }) }],
    });
  };
  vi.stubGlobal('fetch', fake.fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function connect(user: ReturnType<typeof userEvent.setup>, token = 'good-token') {
  await user.click(screen.getByRole('button', { name: 'Build' }));
  await user.type(screen.getByLabelText('Token'), token);
  await user.type(screen.getByLabelText('Repository'), 'me/zmk-config');
  await user.click(screen.getByRole('button', { name: 'Connect' }));
}

describe('Build tab', () => {
  it('shows a clear error for a bad token', async () => {
    const user = userEvent.setup();
    render(<App />);
    await connect(user, 'wrong');
    expect((await screen.findByRole('alert')).textContent).toMatch(/token was rejected/);
  });

  it('commits the changes, follows the build and lists the firmware', async () => {
    const user = userEvent.setup();
    render(<App />);
    await connect(user);
    expect(await screen.findByText(/Connected to/)).toBeTruthy();

    const changes = screen.getByRole('region', { name: 'Changes' });
    const files = within(changes).getAllByRole('listitem');
    expect(files.map((f) => f.textContent)).toEqual([expect.stringContaining('config/lily58.keymap')]);
    await user.click(within(changes).getByRole('button', { name: /config\/lily58\.keymap/ }));
    expect(within(changes).getByLabelText('Changes').textContent).toContain('+ ');

    await user.click(screen.getByRole('button', { name: 'Commit & build' }));
    expect(await screen.findByText('Firmware ready: 2 files.')).toBeTruthy();
    const firmware = within(screen.getByRole('list', { name: 'Firmware files' })).getAllByRole('listitem');
    expect(firmware.map((f) => f.textContent)).toEqual([expect.stringContaining('lily58_left.uf2'), expect.stringContaining('lily58_right.uf2')]);
    expect(fake.commits.get(fake.headSha)?.message).toBe('Update keymap with ZMK Editor');
    expect(screen.getByText('The branch already matches the editor.')).toBeTruthy();
  });

  it('offers the build page and a zip upload when the download is blocked', async () => {
    const user = userEvent.setup();
    fake.blockArtifactDownload = true;
    render(<App />);
    await connect(user);
    await user.click(await screen.findByRole('button', { name: 'Commit & build' }));
    expect((await screen.findByText(/couldn't download the firmware directly/)).textContent).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open the build on GitHub' }).getAttribute('href')).toBe(
      'https://github.com/me/zmk-config/actions/runs/42',
    );
    const zip = new File([zipSync({ 'left.uf2': strToU8('L') })], 'firmware.zip');
    await user.upload(screen.getByLabelText('Open firmware zip'), zip);
    expect(await screen.findByText('Firmware ready: 1 file.')).toBeTruthy();
  });

  it('loads the config from the repo into the editor', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    await connect(user);
    await user.click(await screen.findByRole('button', { name: 'Load config from repo' }));
    await user.click(screen.getByRole('button', { name: 'Keymap' }));
    expect(screen.getByRole('button', { name: 'Key 0: Tab' })).toBeTruthy();
  });
});

describe('Build tab with a designed keyboard', () => {
  it('asks before replacing shield files edited by hand', async () => {
    const config = newHardwareConfig(testPad, 'v0.3');
    const files = generateConfig(config);
    const overlay = 'config/boards/shields/test_pad/test_pad.overlay';
    files[overlay] = `${files[overlay]}/* my tweak */\n`;
    fake = new FakeGitHub(files);
    vi.stubGlobal('fetch', fake.fetch);
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config }));

    const user = userEvent.setup();
    render(<App />);
    await connect(user);
    expect(await screen.findByText(/test_pad\.overlay was changed outside the editor/)).toBeTruthy();
    const commit = screen.getByRole('button', { name: 'Commit & build' });
    expect(commit).toHaveProperty('disabled', true);
    await user.click(screen.getByLabelText('Replace my changes to the shield files'));
    expect(commit).toHaveProperty('disabled', false);
  });

  it('blocks the commit while the hardware has validation errors', async () => {
    const broken = { ...testPad, wiring: { ...testPad.wiring, pins: [null, 5] } } as typeof testPad;
    const config = newHardwareConfig(broken, 'v0.3');
    fake = new FakeGitHub(generateConfig(config));
    vi.stubGlobal('fetch', fake.fetch);
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config }));

    const user = userEvent.setup();
    render(<App />);
    await connect(user);
    expect(await screen.findByText(/Fix the keyboard’s hardware \(Keyboard ▸ Edit hardware\) before committing:/)).toBeTruthy();
    expect(screen.getByText('Input 0 has no pin.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Commit & build' })).toHaveProperty('disabled', true);
  });

  it('forgets the confirmation when reconnecting to a repo', async () => {
    const config = newHardwareConfig(testPad, 'v0.3');
    const files = generateConfig(config);
    const overlay = 'config/boards/shields/test_pad/test_pad.overlay';
    files[overlay] = `${files[overlay]}/* my tweak */\n`;
    fake = new FakeGitHub(files);
    vi.stubGlobal('fetch', fake.fetch);
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config }));

    const user = userEvent.setup();
    render(<App />);
    await connect(user);
    await screen.findByText(/test_pad\.overlay was changed outside the editor/);
    await user.click(screen.getByLabelText('Replace my changes to the shield files'));
    expect(screen.getByRole('button', { name: 'Commit & build' })).toHaveProperty('disabled', false);

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    await connect(user);
    expect(await screen.findByText(/test_pad\.overlay was changed outside the editor/)).toBeTruthy();
    expect(screen.getByLabelText('Replace my changes to the shield files')).toHaveProperty('checked', false);
    expect(screen.getByRole('button', { name: 'Commit & build' })).toHaveProperty('disabled', true);
  });
});

describe('Build tab with settings the designed keyboard can’t support', () => {
  it('blocks the commit while the display is on for a keyboard without a screen', async () => {
    const config = newHardwareConfig(testPad, 'v0.3');
    const def = findSetting('ZMK_DISPLAY');
    if (!def) throw new Error('setting');
    config.kconfig = writeSetting(config.kconfig, def, true);
    const files = generateConfig(newHardwareConfig(testPad, 'v0.3'));
    fake = new FakeGitHub(files);
    vi.stubGlobal('fetch', fake.fetch);
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config }));

    const user = userEvent.setup();
    render(<App />);
    await connect(user);
    expect(await screen.findByText('Display is on, but Test Pad has no screen yet, so the firmware won’t build.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Commit & build' })).toHaveProperty('disabled', true);
  });
});

describe('Build tab with an encoder gap ZMK can’t express', () => {
  it('blocks the commit and says which encoder needs a binding', async () => {
    const config = newHardwareConfig({ ...testPad, encoders: [{ a: 8, b: 9 }, { a: 10, b: 16 }] }, 'v0.3');
    config.keymap = {
      ...config.keymap,
      layers: config.keymap.layers.map((l) => ({ ...l, sensorBindings: [{ behavior: 'trans', params: [] }, { behavior: 'inc_dec_kp', params: ['PG_UP', 'PG_DN'] }] })),
    };
    fake = new FakeGitHub(generateConfig(newHardwareConfig(testPad, 'v0.3')));
    vi.stubGlobal('fetch', fake.fetch);
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config }));

    const user = userEvent.setup();
    render(<App />);
    await connect(user);
    expect(await screen.findByText(/Encoder 1 has no binding on layer Base, but encoder 2 after it does/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Commit & build' })).toHaveProperty('disabled', true);
  });
});

