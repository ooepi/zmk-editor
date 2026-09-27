// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateConfig } from '../core/config.ts';
import { newHardwareConfig } from '../core/hardware/config.ts';
import { testPad } from '../core/hardware/testFixtures.ts';
import { App } from './App.tsx';
import { reloadPreferences } from './state/preferences.ts';

beforeEach(() => {
  localStorage.clear();
  reloadPreferences();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('modules and unicode', () => {
  it('shows Unicode keys as characters', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Key 23: ö (Ö)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Key 35: ä (Ä)' })).toBeTruthy();
  });

  it('puts å on a key with the Unicode picker', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Key 0: Esc' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Behavior' }), 'uc');
    await user.type(screen.getByRole('searchbox', { name: 'Search characters' }), 'å{Enter}');
    expect(screen.getByRole('button', { name: 'Key 0: å (Å)' })).toBeTruthy();

    await user.type(screen.getByRole('searchbox', { name: 'Search characters' }), '€{Enter}');
    expect(screen.getByRole('button', { name: 'Key 0: €' })).toBeTruthy();
  });

  it('ranks Swedish first with the Finnish/Swedish preset', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Modules (2)' }));
    await user.click(screen.getByRole('button', { name: /Finnish\/Swedish preset/ }));
    await user.click(screen.getByRole('button', { name: 'Keymap' }));
    await user.click(screen.getByRole('button', { name: 'Key 0: Esc' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Behavior' }), 'uc');
    await user.type(screen.getByRole('searchbox', { name: 'Search characters' }), 'ä');
    const first = within(screen.getByRole('listbox', { name: 'Characters' })).getAllByRole('option')[0];
    expect(first?.textContent).toContain('UC_SV_AE');
  });

  it('changes the Unicode input method', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Modules (2)' }));
    const select = screen.getByRole('combobox', { name: 'Computer input method' });
    expect((select as HTMLSelectElement).value).toBe('UC_MODE_WIN_COMPOSE');
    await user.selectOptions(select, 'UC_MODE_MACOS');
    expect((screen.getByRole('combobox', { name: 'Computer input method' }) as HTMLSelectElement).value).toBe('UC_MODE_MACOS');
    expect(screen.getByText(/Unicode Hex Input/)).toBeTruthy();
  });

  it('blocks a ZMK version a module lacks, until the module is removed', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    const version = () => screen.getByRole('combobox', { name: 'ZMK version' }) as HTMLSelectElement;
    await user.selectOptions(version(), 'v0.2');
    expect(screen.getByRole('status').textContent).toMatch(/Can't switch to ZMK v0\.2: Unicode has no release/);
    expect(version().value).toBe('v0.3');

    await user.click(screen.getByRole('button', { name: 'Modules (2)' }));
    const card = screen.getByRole('article', { name: 'Unicode' });
    await user.click(within(card).getByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('status').textContent).toMatch(/2 keys that used it now do nothing/);
    await user.selectOptions(version(), 'v0.2');
    expect(version().value).toBe('v0.2');
    expect(within(screen.getByRole('article', { name: 'Unicode' })).getByRole('button', { name: 'Add' })).toHaveProperty('disabled', true);
  });

  it('adds a module and offers its behavior', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Modules (2)' }));
    await user.click(within(screen.getByRole('article', { name: 'Auto layer (num-word)' })).getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Keymap' }));
    await user.click(screen.getByRole('button', { name: 'Key 0: Esc' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Behavior' }), 'num_word');
    expect(screen.getByRole('button', { name: 'Key 0: NAV (num_word)' })).toBeTruthy();
  });

  it('opens a keymap together with its west.yml', async () => {
    const user = userEvent.setup();
    render(<App />);
    const keymap = new File(['/ { keymap { compatible = "zmk,keymap"; l { bindings = <&kp A &kp B>; }; }; };'], 'tiny.keymap');
    const west = new File(
      ['manifest:\n  projects:\n    - name: zmk\n      remote: zmkfirmware\n      revision: v0.2\n      import: app/west.yml\n'],
      'west.yml',
    );
    await user.upload(screen.getByTestId('config-files'), [keymap, west]);
    expect(await screen.findByRole('button', { name: 'Key 1: B' })).toBeTruthy();
    expect((screen.getByRole('combobox', { name: 'ZMK version' }) as HTMLSelectElement).value).toBe('v0.2');
    expect(screen.getByRole('button', { name: 'Modules (0)' })).toBeTruthy();
  });

  it('opens a designed keyboard with its definition file', async () => {
    const user = userEvent.setup();
    render(<App />);
    const files = generateConfig(newHardwareConfig(testPad, 'v0.3'));
    const keymap = new File([files['config/test_pad.keymap'] ?? ''], 'test_pad.keymap');
    const definition = new File([files['config/boards/shields/test_pad/test_pad.editor.json'] ?? ''], 'test_pad.editor.json');
    await user.upload(screen.getByTestId('config-files'), [keymap, definition]);
    expect(await screen.findByRole('button', { name: 'Test Pad ▾' })).toBeTruthy();
  });
});
