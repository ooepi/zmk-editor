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
