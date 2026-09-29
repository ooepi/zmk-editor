// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';

const CORNE_KEYMAP = `
#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
/ { keymap { compatible = "zmk,keymap"; default_layer { display-name = "Base"; bindings = <${'&kp A '.repeat(41)}&kp Z>; }; }; };`;

let requested: string[];

beforeEach(() => {
  localStorage.clear();
  requested = [];
  vi.stubGlobal('fetch', async (url: string) => {
    requested.push(url);
    return new Response(url.endsWith('.keymap') ? CORNE_KEYMAP : 'CONFIG_ZMK_SLEEP=y\n');
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Keyboard page', () => {
  it('shows the current keyboard from the catalog', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Lily58 ▾' }));
    const current = screen.getByRole('region', { name: 'Current keyboard' });
    expect(current.textContent).toContain('Lily58');
    expect(current.textContent).toContain('58 keys');
  });

  it('starts a new config for another keyboard', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Lily58 ▾' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search keyboards' }), 'corne');
    const list = screen.getByRole('list', { name: 'Keyboards' });
    await user.click(within(list).getByRole('button', { name: /^Corne42 keys · split/ }));
    expect(screen.getByRole('img', { name: 'Corne layout' }).children).toHaveLength(42);
    expect((screen.getByRole('combobox', { name: 'Controller' }) as HTMLSelectElement).value).toBe('nice_nano_v2');
    await user.click(screen.getByRole('switch', { name: 'nice!view display' }));
    await user.click(screen.getByRole('button', { name: 'Create config for Corne' }));

    expect(await screen.findByRole('button', { name: 'Corne ▾' })).toBeTruthy();
    expect(requested).toEqual([
      'https://raw.githubusercontent.com/zmkfirmware/zmk/v0.3/app/boards/shields/corne/corne.keymap',
      'https://raw.githubusercontent.com/zmkfirmware/zmk/v0.3/app/boards/shields/corne/corne.conf',
    ]);
    const keys = within(screen.getByRole('group', { name: 'Keyboard layout' })).getAllByRole('button');
    expect(keys).toHaveLength(42);
    expect(screen.getByRole('button', { name: 'Key 41: Z' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Modules (0)' })).toBeTruthy();
  });
});
