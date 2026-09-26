// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
