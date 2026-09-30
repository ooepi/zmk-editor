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
  await user.click(screen.getByRole('button', { name: 'Change keyboard: Lily58' }));
  await user.click(screen.getByRole('button', { name: 'Open layout designer' }));
}

describe('Layout designer', () => {
  it('moves several selected keys together', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDesigner(user);
    await user.click(within(screen.getByRole('group', { name: 'Layout canvas' })).getByRole('button', { name: /^Key 0:/ }));
    await user.keyboard('{Control>}');
    await user.click(within(screen.getByRole('group', { name: 'Layout canvas' })).getByRole('button', { name: /^Key 1:/ }));
    await user.keyboard('{/Control}');
    expect(screen.getByText(/2 keys selected/)).toBeTruthy();
    const before = [rect(0)?.getAttribute('y'), rect(1)?.getAttribute('y')].map(Number);
    within(screen.getByRole('group', { name: 'Layout canvas' })).getByRole('button', { name: /^Key 0:/ }).focus();
    await user.keyboard('{ArrowDown}');
    expect([rect(0)?.getAttribute('y'), rect(1)?.getAttribute('y')].map(Number)).toEqual(before.map((y) => y + 25));
  });

  it('starts from the current layout with every key', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDesigner(user);
    const keys = within(screen.getByRole('group', { name: 'Layout canvas' })).getAllByRole('button', { name: /^Key \d+:/ });
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
    await user.type(width, '1.5');
    // Applied while typing, without Enter.
    expect(rect(0)?.getAttribute('width')).toBe('142');
    const rotation = screen.getByRole('spinbutton', { name: 'Rotation (°)' });
    await user.clear(rotation);
    await user.type(rotation, '-15');
    const key = within(screen.getByRole('group', { name: 'Layout canvas' })).getByRole('button', { name: /^Key 0:/ });
    expect(key.getAttribute('transform')).toBe('rotate(-15 75 100)');
    await user.clear(rotation);
    await user.type(rotation, '0');

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

describe('encoder knobs in the layout designer', () => {
  const knob = () => within(screen.getByRole('group', { name: 'Layout canvas' })).getByRole('button', { name: 'Encoder 1' });
  const cx = () => Number(knob().querySelector('circle')?.getAttribute('cx'));

  it('moves a knob with the arrow keys and its fields, and saves it with the layout', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDesigner(user);
    await user.click(knob());
    const x = screen.getByRole('spinbutton', { name: 'X (keys)' });
    await user.clear(x);
    await user.type(x, '3');
    expect(cx()).toBe(300);
    knob().focus();
    await user.keyboard('{ArrowRight}');
    expect(cx()).toBe(325);
    await user.click(screen.getByRole('button', { name: 'Save layout' }));
    const stored = JSON.parse(localStorage.getItem('zmk-editor.config.v1') ?? '{}') as { config?: { layout?: { encoders?: { x: number }[] } } };
    expect(stored.config?.layout?.encoders?.[0]?.x).toBe(325);
  });

  it('puts a moved knob back in its default place', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDesigner(user);
    const start = cx();
    await user.click(knob());
    await user.keyboard('{ArrowRight}');
    expect(cx()).toBe(start + 25);
    await user.click(screen.getByRole('button', { name: 'Default position' }));
    expect(cx()).toBe(start);
  });
});
