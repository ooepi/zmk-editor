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

const rail = () => within(screen.getByRole('navigation', { name: 'Layers' }));
const tabNames = () => rail().getAllByRole('tab').map((t) => t.textContent);

describe('layer rail', () => {
  it('lists the layers as vertical tabs', () => {
    render(<App />);
    expect(rail().getByRole('tablist').getAttribute('aria-orientation')).toBe('vertical');
    expect(tabNames()).toEqual(['0BASE', '1NAV', '2PROG', '3QWER', '4NUM', '5MOUS']);
  });

  it('deletes the layer on that row, not the active one, after naming it', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<App />);
    await user.click(rail().getByRole('button', { name: 'Delete layer NUM' }));
    expect(confirm.mock.calls[0]?.[0]).toContain('"NUM"');
    expect(tabNames()).toEqual(['0BASE', '1NAV', '2PROG', '3QWER', '4MOUS']);
    expect(rail().getByRole('tab', { selected: true }).textContent).toBe('0BASE');
  });

  it('renames a layer from its row', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(rail().getByRole('button', { name: 'Rename layer NAV' }));
    const input = screen.getByRole('textbox', { name: 'Layer name' });
    await user.clear(input);
    await user.type(input, 'Arrows{Enter}');
    expect(tabNames()[1]).toBe('1Arrows');
  });

  it('moves the focused layer with Alt+Arrow keys', async () => {
    const user = userEvent.setup();
    render(<App />);
    rail().getByRole('tab', { name: /NAV/ }).focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(tabNames()).toEqual(['0BASE', '1PROG', '2NAV', '3QWER', '4NUM', '5MOUS']);
    expect(document.activeElement?.textContent).toBe('2NAV');
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(tabNames()[1]).toBe('1NAV');
  });

  it('cannot delete the only layer', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<App />);
    for (const name of ['MOUS', 'NUM', 'QWER', 'PROG', 'NAV']) await user.click(rail().getByRole('button', { name: `Delete layer ${name}` }));
    expect(rail().getByRole('button', { name: 'Delete layer BASE' })).toHaveProperty('disabled', true);
  });
});
