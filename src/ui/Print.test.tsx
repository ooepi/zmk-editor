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

const sheet = () => within(screen.getByRole('article', { name: 'Cheat sheet' }));
const layerSections = () => sheet().getAllByRole('region').filter((r) => r.getAttribute('aria-label')?.startsWith('Layer '));

describe('printable cheat sheet', () => {
  it('shows every layer, lets you leave some out, and prints', async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Print keymap' }));

    expect(sheet().getByRole('heading', { level: 1, name: 'Lily58 keymap' })).toBeTruthy();
    expect(layerSections().map((s) => s.getAttribute('aria-label'))).toEqual([
      'Layer 0: BASE',
      'Layer 1: NAV',
      'Layer 2: PROG',
      'Layer 3: QWER',
      'Layer 4: NUM',
      'Layer 5: MOUS',
    ]);
    expect(within(layerSections()[1] as HTMLElement).getAllByRole('button', { name: /^Key \d+:/ })).toHaveLength(58);

    await user.click(screen.getByRole('checkbox', { name: '3 · QWER' }));
    expect(layerSections()).toHaveLength(5);

    await user.click(screen.getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('article', { name: 'Cheat sheet' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Keyboard layout' })).toBeTruthy();
  });

  it('lists combos with the keys named, and can leave them out', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Combos/ }));
    await user.click(screen.getByRole('button', { name: '+ New combo' }));
    await user.click(screen.getByRole('button', { name: 'Key 0: Esc' }));
    await user.click(screen.getByRole('button', { name: 'Key 1: 1' }));

    await user.click(screen.getByRole('button', { name: 'Print keymap' }));
    const combos = within(sheet().getByRole('region', { name: 'Combos' }));
    expect(combos.getByRole('cell', { name: 'Esc + 1' })).toBeTruthy();
    expect(combos.getByRole('cell', { name: 'All layers' })).toBeTruthy();

    await user.click(screen.getByRole('checkbox', { name: 'Combos (1)' }));
    expect(sheet().queryByRole('region', { name: 'Combos' })).toBeNull();
  });
});
