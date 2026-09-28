// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findSetting, writeSetting } from '../core/catalog/settings.ts';
import { newHardwareConfig } from '../core/hardware/config.ts';
import { testSplit } from '../core/hardware/testFixtures.ts';
import { App } from './App.tsx';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const conf = () => (screen.getByRole('textbox', { name: '.conf file' }) as HTMLTextAreaElement).value;

async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Settings' }));
  await user.click(screen.getByText('Edit the .conf file directly'));
}

describe('Settings tab', () => {
  it('shows the current settings from the .conf', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openSettings(user);
    const power = screen.getByRole('region', { name: 'Power & sleep' });
    expect((within(power).getByRole('checkbox', { name: 'Deep sleep' }) as HTMLInputElement).checked).toBe(true);
    expect((within(power).getByRole('spinbutton', { name: 'Idle after (ms)' }) as HTMLInputElement).value).toBe('300000');
    expect(within(power).getByText(/Now: 5 min/)).toBeTruthy();
    const bt = screen.getByRole('region', { name: 'Bluetooth' });
    expect((within(bt).getByRole('combobox', { name: 'Transmit power' }) as HTMLSelectElement).value).toBe('BT_CTLR_TX_PWR_PLUS_8');
    expect(screen.queryByRole('alert', { name: 'Setting problems' })).toBeNull();
  });

  it('writes changes to the .conf and resets to default', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openSettings(user);
    const lighting = screen.getByRole('region', { name: 'RGB underglow' });
    await user.click(within(lighting).getByRole('checkbox', { name: 'RGB underglow' }));
    expect(conf()).toContain('CONFIG_ZMK_RGB_UNDERGLOW=y');

    const bt = screen.getByRole('region', { name: 'Bluetooth' });
    await user.selectOptions(within(bt).getByRole('combobox', { name: 'Transmit power' }), 'BT_CTLR_TX_PWR_PLUS_4');
    expect(conf()).toContain('CONFIG_BT_CTLR_TX_PWR_PLUS_4=y');
    expect(conf()).not.toContain('PLUS_8');

    const power = screen.getByRole('region', { name: 'Power & sleep' });
    await user.click(within(power).getByRole('button', { name: 'Reset Deep sleep to default' }));
    expect(conf()).not.toContain('CONFIG_ZMK_SLEEP');
    await user.click(within(power).getByRole('checkbox', { name: 'Deep sleep' }));
    expect(conf()).toContain('CONFIG_ZMK_SLEEP=y');
  });

  it('warns about mouse keys with pointing off, and fixes it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openSettings(user);
    const input = screen.getByRole('region', { name: 'Encoders & pointing' });
    await user.click(within(input).getByRole('button', { name: 'Reset Mouse keys to default' }));
    const alert = screen.getByRole('alert', { name: 'Setting problems' });
    expect(alert.textContent).toMatch(/mouse keys are off/);
    await user.click(within(alert).getByRole('button', { name: 'Turn on' }));
    expect(screen.queryByRole('alert', { name: 'Setting problems' })).toBeNull();
    expect(conf()).toContain('CONFIG_ZMK_POINTING=y');
  });

  it('applies a directly edited .conf, and undo restores it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openSettings(user);
    const textarea = screen.getByRole('textbox', { name: '.conf file' });
    await user.clear(textarea);
    await user.type(textarea, 'CONFIG_ZMK_SLEEP=n');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect((screen.getByRole('checkbox', { name: 'Deep sleep' }) as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect((screen.getByRole('checkbox', { name: 'Deep sleep' }) as HTMLInputElement).checked).toBe(true);
  });
});

describe('Settings for a designed keyboard', () => {
  function seed(displayOn: boolean) {
    const config = newHardwareConfig(testSplit, 'v0.3');
    const def = findSetting('ZMK_DISPLAY');
    if (!def) throw new Error('setting');
    if (displayOn) config.kconfig = writeSetting(config.kconfig, def, true);
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config }));
  }

  it('won’t turn on a display the keyboard doesn’t have', async () => {
    seed(false);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const display = within(screen.getByRole('region', { name: 'Display' })).getByRole('checkbox', { name: 'Display' });
    expect(display).toHaveProperty('disabled', true);
    expect(screen.getAllByText(/Test Split doesn’t have this hardware yet\./).length).toBeGreaterThan(0);
    // Settings without hardware needs stay usable.
    expect(within(screen.getByRole('region', { name: 'Power & sleep' })).getByRole('checkbox', { name: 'Deep sleep' })).toHaveProperty('disabled', false);
  });

  it('offers to turn off a display that was already on', async () => {
    seed(true);
    const user = userEvent.setup();
    render(<App />);
    await openSettings(user);
    const problems = screen.getByRole('alert', { name: 'Setting problems' });
    expect(problems.textContent).toContain('Display is on, but Test Split has no screen yet, so the firmware won’t build.');
    await user.click(within(problems).getByRole('button', { name: 'Turn off' }));
    expect(conf()).toContain('CONFIG_ZMK_DISPLAY=n');
    expect(screen.queryByRole('alert', { name: 'Setting problems' })).toBeNull();
  });
});
