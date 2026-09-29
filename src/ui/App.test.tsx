// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import { chooseBehavior } from './testUtils.ts';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const keys = () => within(screen.getByRole('group', { name: 'Keyboard layout' })).getAllByRole('button');
const tabs = () => screen.getAllByRole('tab');

describe('App', () => {
  it('shows the Lily58 demo with 58 keys and 6 layers', () => {
    render(<App />);
    expect(keys()).toHaveLength(58);
    expect(tabs().map((t) => t.textContent)).toEqual(['0BASE', '1NAV', '2PROG', '3QWER', '4NUM', '5MOUS']);
    expect(screen.getByRole('button', { name: 'Key 0: Esc' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Key 52: NAV (mo)' })).toBeTruthy();
  });

  it('edits a key with the keycode picker, then undoes it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Key 0: Esc' }));
    expect(screen.getByRole('heading', { name: 'Key 0 · BASE' })).toBeTruthy();

    await user.type(screen.getByRole('searchbox', { name: 'Search keys for Value' }), 'tab{Enter}');
    expect(screen.getByRole('button', { name: 'Key 0: Tab' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Ctl' }));
    expect(screen.getByRole('button', { name: 'Key 0: Ctl+Tab' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: 'Key 0: Esc' })).toBeTruthy();
  });

  it('switches a key to a layer-tap', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Key 54: Space' }));
    await chooseBehavior(user, 'lt');
    expect(screen.getByRole('button', { name: 'Key 54: Space (NAV)' })).toBeTruthy();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Hold (layer)' }), '4');
    expect(screen.getByRole('button', { name: 'Key 54: Space (NUM)' })).toBeTruthy();
  });

  it('makes the selected key transparent with Delete', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Key 1: 1' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Key 1: 1' }));
    await user.click(screen.getByRole('heading', { name: 'Key 1 · BASE' }));
    await user.keyboard('{Delete}');
    expect(screen.getByRole('button', { name: 'Key 1: ▽' })).toBeTruthy();
  });

  it('adds, renames and deletes layers', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Add layer' }));
    const nameInput = screen.getByRole('textbox', { name: 'Layer name' });
    await user.clear(nameInput);
    await user.type(nameInput, 'Gaming{Enter}');
    expect(tabs().at(-1)?.textContent).toBe('6Gaming');
    expect(tabs().at(-1)?.getAttribute('aria-selected')).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Delete layer Gaming' }));
    expect(tabs()).toHaveLength(6);
  });

  it('never has the GitHub popover and the More menu open together', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open from GitHub' }));
    expect(screen.getByRole('dialog', { name: 'Open from GitHub' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('dialog', { name: 'Open from GitHub' })).toBeNull();
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('keeps everyday actions in the top bar and the rest in the More menu', async () => {
    const user = userEvent.setup();
    render(<App />);
    for (const name of ['Undo', 'Redo', 'Open from GitHub', 'Print keymap']) expect(screen.getByRole('button', { name })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Download .keymap' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Open files',
      'Download .keymap',
      'Download config (.zip)',
      'Reset to demo',
    ]);
  });

  it('shows the views as tabs with counts, and help from the top bar only', () => {
    render(<App />);
    const nav = within(screen.getByRole('navigation', { name: 'Views' }));
    const names = nav.getAllByRole('button').map((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').replace(/ \(\d+\)$/, ' (n)'));
    expect(names).toEqual(['Keymap', 'Combos (n)', 'Behaviors (n)', 'Macros (n)', 'Modules (n)', 'Screens', 'Settings', 'Build & flash']);
    expect(nav.queryByRole('button', { name: 'Help' })).toBeNull();
  });

  it('keeps edits after a reload', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.click(screen.getByRole('button', { name: 'Key 0: Esc' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search keys for Value' }), 'grave{Enter}');
    unmount();
    render(<App />);
    expect(screen.getByRole('button', { name: 'Key 0: `' })).toBeTruthy();
  });
});
