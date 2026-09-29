// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findSetting, writeSetting } from '../core/catalog/settings.ts';
import { newHardwareConfig } from '../core/hardware/config.ts';
import { testSplit } from '../core/hardware/testFixtures.ts';
import { App } from './App.tsx';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

type User = ReturnType<typeof userEvent.setup>;

const nav = () => screen.getByRole('navigation', { name: 'Setting groups' });
const navItem = (label: string) =>
  within(nav()).getByRole('button', { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
const region = (label: string) => screen.getByRole('region', { name: label });

async function openSettings(user: User) {
  await user.click(screen.getByRole('button', { name: 'Settings' }));
}

async function openGroup(user: User, label: string) {
  await user.click(navItem(label));
  return region(label);
}

/** The .conf as the Raw .conf pane shows it (this switches to that pane). */
async function conf(user: User) {
  await user.click(navItem('Raw .conf'));
  return (screen.getByRole('textbox', { name: '.conf file' }) as HTMLTextAreaElement).value;
}

const checked = (el: HTMLElement) => (el as HTMLInputElement).checked;

describe('Settings tab', () => {
  it('opens on Power & sleep and shows the current settings from the .conf', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openSettings(user);
    const power = region('Power & sleep');
    expect(checked(within(power).getByRole('switch', { name: 'Deep sleep' }))).toBe(true);
    expect((within(power).getByRole('spinbutton', { name: 'Idle after (ms)' }) as HTMLInputElement).value).toBe('300000');
    expect(within(power).getByText('= 5 min')).toBeTruthy();
    // Only the chosen group shows.
    expect(screen.queryByRole('region', { name: 'Bluetooth' })).toBeNull();

    const bt = await openGroup(user, 'Bluetooth');
    // Transmit power is advanced, but it's changed, so it shows without asking.
    expect((within(bt).getByRole('combobox', { name: 'Transmit power' }) as HTMLSelectElement).value).toBe(
      'BT_CTLR_TX_PWR_PLUS_8',
    );
    expect(screen.queryByRole('alert', { name: 'Setting problems' })).toBeNull();
  });

  it('writes changes to the .conf and resets to default', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openSettings(user);
    const lighting = await openGroup(user, 'RGB underglow');
    await user.click(within(lighting).getByRole('switch', { name: 'RGB underglow' }));
    const bt = await openGroup(user, 'Bluetooth');
    await user.selectOptions(within(bt).getByRole('combobox', { name: 'Transmit power' }), 'BT_CTLR_TX_PWR_PLUS_4');
    let text = await conf(user);
    expect(text).toContain('CONFIG_ZMK_RGB_UNDERGLOW=y');
    expect(text).toContain('CONFIG_BT_CTLR_TX_PWR_PLUS_4=y');
    expect(text).not.toContain('PLUS_8');

    let power = await openGroup(user, 'Power & sleep');
    await user.click(within(power).getByRole('button', { name: 'Reset Deep sleep to default' }));
    expect(await conf(user)).not.toContain('CONFIG_ZMK_SLEEP');
    power = await openGroup(user, 'Power & sleep');
    await user.click(within(power).getByRole('switch', { name: 'Deep sleep' }));
    text = await conf(user);
    expect(text).toContain('CONFIG_ZMK_SLEEP=y');
  });

  it('counts the changed settings in each group', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openSettings(user);
    const count = () => Number(/(\d+) changed/.exec(navItem('Power & sleep').textContent ?? '')?.[1] ?? 0);
    const before = count();
    expect(before).toBeGreaterThan(0);
    await user.click(within(region('Power & sleep')).getByRole('button', { name: 'Reset Deep sleep to default' }));
    expect(count()).toBe(before - 1);
  });

  it('keeps rarely used settings behind Show advanced', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openSettings(user);
    const bt = await openGroup(user, 'Bluetooth');
    expect(within(bt).queryByRole('switch', { name: 'Experimental security' })).toBeNull();
    const toggle = within(bt).getByRole('button', { name: /^Show \d+ advanced settings?$/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    expect(within(bt).getByRole('switch', { name: 'Experimental security' })).toBeTruthy();
    expect(within(bt).getByRole('button', { name: 'Hide advanced settings' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('shows every changed setting on one screen with Changed only', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openSettings(user);
    await user.click(screen.getByRole('button', { name: /^Changed only/ }));
    expect(within(region('Power & sleep')).getByRole('switch', { name: 'Deep sleep' })).toBeTruthy();
    expect(within(region('Power & sleep')).queryByRole('switch', { name: 'Soft off' })).toBeNull();
    expect(within(region('Bluetooth')).getByRole('combobox', { name: 'Transmit power' })).toBeTruthy();
    // A reset row stays put (no longer marked) with focus on it, and leaves the list next time.
    await user.click(within(region('Power & sleep')).getByRole('button', { name: 'Reset Deep sleep to default' }));
    const sleep = screen.getByRole('switch', { name: 'Deep sleep' });
    expect(document.activeElement).toBe(sleep);
    expect(within(region('Power & sleep')).queryByRole('button', { name: 'Reset Deep sleep to default' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Changed only/ }));
    await user.click(screen.getByRole('button', { name: /^Changed only/ }));
    expect(screen.queryByRole('switch', { name: 'Deep sleep' })).toBeNull();
  });

  it('keeps a changed row while its field is cleared to retype it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openSettings(user);
    await user.click(screen.getByRole('button', { name: /^Changed only/ }));
    const idle = screen.getByRole('spinbutton', { name: 'Idle after (ms)' });
    await user.clear(idle);
    await user.type(idle, '60000');
    expect((screen.getByRole('spinbutton', { name: 'Idle after (ms)' }) as HTMLInputElement).value).toBe('60000');
    expect(document.activeElement).toBe(screen.getByRole('spinbutton', { name: 'Idle after (ms)' }));
  });

  it('turns Changed only off back to the group it came from', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openSettings(user);
    await openGroup(user, 'Display');
    await user.click(screen.getByRole('button', { name: /^Changed only/ }));
    await user.click(screen.getByRole('button', { name: /^Changed only/ }));
    expect(navItem('Display').getAttribute('aria-current')).toBe('true');
  });

  it('lists a known setting with a value it can’t read under Raw .conf', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openSettings(user);
    await user.click(navItem('Raw .conf'));
    const textarea = screen.getByRole('textbox', { name: '.conf file' });
    await user.clear(textarea);
    await user.type(textarea, 'CONFIG_ZMK_IDLE_TIMEOUT=abc');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByText('CONFIG_ZMK_IDLE_TIMEOUT=abc (value not understood)')).toBeTruthy();
    expect(navItem('Raw .conf').textContent).toContain('1 other');
  });

  it('warns about mouse keys with pointing off, links to its group, and fixes it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openSettings(user);
    const input = await openGroup(user, 'Encoders & pointing');
    await user.click(within(input).getByRole('button', { name: 'Reset Mouse keys to default' }));
    await openGroup(user, 'Power & sleep');
    const alert = screen.getByRole('alert', { name: 'Setting problems' });
    expect(alert.textContent).toMatch(/mouse keys are off/);
    await user.click(within(alert).getByRole('button', { name: 'Show Encoders & pointing' }));
    expect(region('Encoders & pointing')).toBeTruthy();
    // The link lands on the setting itself.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('switch', { name: 'Mouse keys' })));
    await user.click(within(alert).getByRole('button', { name: 'Turn on' }));
    expect(screen.queryByRole('alert', { name: 'Setting problems' })).toBeNull();
    expect(await conf(user)).toContain('CONFIG_ZMK_POINTING=y');
  });

  it('applies a directly edited .conf, and undo restores it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openSettings(user);
    await user.click(navItem('Raw .conf'));
    const textarea = screen.getByRole('textbox', { name: '.conf file' });
    await user.clear(textarea);
    await user.type(textarea, 'CONFIG_ZMK_SLEEP=n');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await openGroup(user, 'Power & sleep');
    expect(checked(screen.getByRole('switch', { name: 'Deep sleep' }))).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(checked(screen.getByRole('switch', { name: 'Deep sleep' }))).toBe(true);
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
    await openSettings(user);
    // Settings without hardware needs stay usable.
    expect(within(region('Power & sleep')).getByRole('switch', { name: 'Deep sleep' })).toHaveProperty('disabled', false);
    const display = within(await openGroup(user, 'Display')).getByRole('switch', { name: 'Display' });
    expect(display).toHaveProperty('disabled', true);
    expect(screen.getAllByText(/Test Split doesn’t have this hardware yet\./).length).toBeGreaterThan(0);
  });

  it('offers to turn off a display that was already on', async () => {
    seed(true);
    const user = userEvent.setup();
    render(<App />);
    await openSettings(user);
    const problems = screen.getByRole('alert', { name: 'Setting problems' });
    expect(problems.textContent).toContain('Display is on, but Test Split has no screen yet, so the firmware won’t build.');
    await user.click(within(problems).getByRole('button', { name: 'Turn off' }));
    expect(await conf(user)).toContain('CONFIG_ZMK_DISPLAY=n');
    expect(screen.queryByRole('alert', { name: 'Setting problems' })).toBeNull();
  });
});
