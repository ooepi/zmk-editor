// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const rect = (index: number) =>
  within(screen.getByRole('group', { name: 'Layout canvas' }))
    .getByRole('button', { name: new RegExp(`^Key ${index}:`) })
    .querySelector('rect');

async function openDesigner(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Lily58 ▾' }));
  await user.click(screen.getByRole('button', { name: 'Open layout designer' }));
}

describe('Layout designer', () => {
  it('starts from the current layout with every key', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDesigner(user);
    const keys = within(screen.getByRole('group', { name: 'Layout canvas' })).getAllByRole('button');
    expect(keys).toHaveLength(58);
    expect(screen.getByRole('button', { name: 'Save layout' })).toHaveProperty('disabled', true);
  });

  it('edits a key with fields and arrow keys, then saves it for the whole editor', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDesigner(user);
    await user.click(within(screen.getByRole('group', { name: 'Layout canvas' })).getByRole('button', { name: /^Key 0:/ }));
    const width = screen.getByRole('spinbutton', { name: 'Width (keys)' });
    await user.clear(width);
    await user.type(width, '1.5{Enter}');
    expect(rect(0)?.getAttribute('width')).toBe('142');

    const key0 = within(screen.getByRole('group', { name: 'Layout canvas' })).getByRole('button', { name: /^Key 0:/ });
    key0.focus();
    await user.keyboard('{ArrowRight}{Shift>}{ArrowDown}{/Shift}');
    expect((screen.getByRole('spinbutton', { name: 'X (keys)' }) as HTMLInputElement).value).toBe('0.25');
    expect((screen.getByRole('spinbutton', { name: 'Y (keys)' }) as HTMLInputElement).value).toBe('1.5');

    await user.click(screen.getByRole('button', { name: 'Save layout' }));
    expect(screen.getByRole('status').textContent).toMatch(/config\/info\.json/);
    await user.click(screen.getByRole('button', { name: 'Close designer' }));
    expect(screen.getByText('Using your own layout (saved as config/info.json).')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Keymap' }));
    const keycap = screen.getByRole('button', { name: 'Key 0: Esc' });
    expect(keycap.style.width).not.toBe('');
  });

  it('applies a template and shows the ZMK export', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    await openDesigner(user);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Template' }), 'grid');
    const columns = screen.getByRole('spinbutton', { name: 'Columns' });
    await user.clear(columns);
    await user.type(columns, '10');
    await user.click(screen.getByRole('button', { name: 'Apply template' }));
    expect(rect(10)?.getAttribute('x')).toBe('4');
    expect(rect(10)?.getAttribute('y')).toBe('104');
    await user.click(screen.getByText('Export for ZMK (.dtsi)'));
    expect(screen.getByLabelText('ZMK layout').textContent).toContain('compatible = "zmk,physical-layout";');
  });

  it('removes a saved layout', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    await openDesigner(user);
    await user.click(screen.getByRole('button', { name: 'Apply template' }));
    await user.click(screen.getByRole('button', { name: 'Save layout' }));
    await user.click(screen.getByRole('button', { name: 'Remove saved layout' }));
    expect(screen.queryByText('Using your own layout (saved as config/info.json).')).toBeNull();
  });
});
