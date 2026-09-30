// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App.tsx';
import { demoConfig } from './state/demo.ts';
import { reloadPreferences } from './state/preferences.ts';
import { fakeDeviceFor, type FakeDevice } from './studio/fakeDevice.ts';

beforeEach(() => {
  localStorage.clear();
  reloadPreferences();
});
afterEach(cleanup);

const topbar = () => within(document.querySelector<HTMLElement>('header.topbar') ?? document.body);

function renderWith(device: FakeDevice, welcome = false) {
  render(<App welcome={welcome} studioOpen={async () => device} />);
  return device;
}

describe('the keyboard connection in the top bar', () => {
  it('connects, waits for the unlock key, and disconnects', async () => {
    const user = userEvent.setup();
    const device = renderWith(fakeDeviceFor(demoConfig().config, { locked: true }));
    await user.click(topbar().getByRole('button', { name: 'Connect keyboard' }));
    await waitFor(() => expect(topbar().getByText('Press your unlock key')).toBeTruthy());
    act(() => device.unlock());
    await waitFor(() => expect(topbar().getByRole('status').textContent).toBe('Fake KeyboardLive'));
    await user.click(topbar().getByRole('button', { name: 'Keyboard connection' }));
    await user.click(screen.getByRole('menuitem', { name: 'Disconnect' }));
    expect(topbar().getByRole('button', { name: 'Connect keyboard' })).toBeTruthy();
  });

  it('is off, and says why, in a browser without Web Serial', () => {
    render(<App />);
    const button = topbar().getByRole('button', { name: 'Connect keyboard' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain('Chrome or Edge');
  });

  it('takes the keymap from the keyboard when the editor holds the demo', async () => {
    const user = userEvent.setup();
    renderWith(fakeDeviceFor({ ...demoConfig().config, studio: { device: 'Studio Board' } }, { locked: false }));
    await user.click(topbar().getByRole('button', { name: 'Connect keyboard' }));
    await waitFor(() => expect(topbar().getByRole('button', { name: 'Change keyboard: Studio Board' })).toBeTruthy());
  });
});

describe('the welcome dialog', () => {
  it('offers to connect a Studio keyboard', async () => {
    const user = userEvent.setup();
    renderWith(fakeDeviceFor({ ...demoConfig().config, studio: { device: 'Studio Board' } }, { locked: false }), true);
    await user.click(screen.getByRole('button', { name: 'Connect a Studio keyboard' }));
    await waitFor(() => expect(topbar().getByRole('button', { name: 'Change keyboard: Studio Board' })).toBeTruthy());
    expect(screen.queryByRole('dialog', { name: 'Welcome to ZMK Editor' })).toBeNull();
  });
});

/** A config of your own (not the demo), so connecting compares instead of loading. */
function ownConfig() {
  const config = { ...demoConfig().config, keyboard: 'my_lily' };
  localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config }));
  return config;
}

async function connectLive(user: ReturnType<typeof userEvent.setup>) {
  const device = renderWith(fakeDeviceFor(ownConfig(), { locked: false }));
  await user.click(topbar().getByRole('button', { name: 'Connect keyboard' }));
  await waitFor(() => expect(topbar().getByRole('status').textContent).toContain('Live'));
  return device;
}

const saveBar = () => screen.queryByRole('region', { name: 'Unsaved keyboard changes' });

describe('the save bar', () => {
  it('appears once a change is live, and saving clears it', async () => {
    const user = userEvent.setup();
    await connectLive(user);
    expect(saveBar()).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Key 1:/ }));
    await user.keyboard('{Delete}');
    await waitFor(() => expect(saveBar()?.textContent).toContain('Live on the keyboard, not saved yet'));
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    await user.click(within(saveBar() as HTMLElement).getByRole('button', { name: 'Save to keyboard' }));
    await waitFor(() => expect(saveBar()).toBeNull());
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it('discard puts the key back', async () => {
    const user = userEvent.setup();
    await connectLive(user);
    const key = () => screen.getByRole('button', { name: /^Key 1:/ });
    const before = key().getAttribute('aria-label');
    await user.click(key());
    await user.keyboard('{Delete}');
    await waitFor(() => expect(saveBar()).not.toBeNull());
    await user.click(within(saveBar() as HTMLElement).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(saveBar()).toBeNull());
    expect(key().getAttribute('aria-label')).toBe(before);
  });
});

describe('the mismatch dialog', () => {
  const mismatchDialog = () => screen.queryByRole('dialog', { name: 'The keyboard has a different keymap' });

  it('lists the differences and sends your config on request', async () => {
    const user = userEvent.setup();
    const device = fakeDeviceFor(ownConfig(), { locked: false });
    const original = (await device.keymap()).layers[0]?.bindings[0];
    await device.setBinding(0, 0, { behaviorId: original?.behaviorId ?? 0, param1: 0x070014, param2: 0 });
    renderWith(device);
    await user.click(topbar().getByRole('button', { name: 'Connect keyboard' }));
    await waitFor(() => expect(mismatchDialog()).not.toBeNull());
    const dialog = within(mismatchDialog() as HTMLElement);
    expect(dialog.getByText(/1 key on 1 layer/)).toBeTruthy();
    expect(dialog.getByText(/&kp Q/)).toBeTruthy();
    await user.click(dialog.getByRole('button', { name: 'Send my config to the keyboard' }));
    await waitFor(async () => expect((await device.keymap()).layers[0]?.bindings[0]).toEqual(original));
    expect(mismatchDialog()).toBeNull();
  });

  it('offers to edit the keyboard on its own when it is a different keyboard', async () => {
    const user = userEvent.setup();
    ownConfig();
    const other = fakeDeviceFor({ ...demoConfig().config, keyboard: 'other', studio: { device: 'Other Board' } }, { locked: false });
    const layers = (await other.keymap()).layers;
    const small = (await import('./studio/fakeDevice.ts')).createFakeDevice({
      name: 'Other Board',
      locked: false,
      behaviors: await other.behaviors(),
      layers: layers.map((l) => ({ ...l, bindings: l.bindings.slice(0, 10) })),
      spare: 0,
      layout: { name: 'Ten', keys: Array.from({ length: 10 }, (_, i) => ({ x: i * 100, y: 0, w: 100, h: 100, r: 0, rx: 0, ry: 0 })) },
    });
    render(<App studioOpen={async () => small} />);
    await user.click(topbar().getByRole('button', { name: 'Connect keyboard' }));
    await waitFor(() => expect(mismatchDialog()).not.toBeNull());
    const dialog = within(mismatchDialog() as HTMLElement);
    expect(dialog.queryByRole('button', { name: 'Send my config to the keyboard' })).toBeNull();
    await user.click(dialog.getByRole('button', { name: 'Edit the keyboard’s own keymap' }));
    await waitFor(() => expect(topbar().getByRole('button', { name: 'Change keyboard: Other Board' })).toBeTruthy());
  });
});
