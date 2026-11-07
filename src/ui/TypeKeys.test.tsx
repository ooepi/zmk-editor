// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App.tsx';
import { reloadPreferences } from './state/preferences.ts';

beforeEach(() => {
  localStorage.clear();
  reloadPreferences();
});
afterEach(cleanup);

const board = () => screen.getByRole('group', { name: 'Keyboard layout' });
const key = (index: number) => within(board()).getAllByRole('button')[index] as HTMLElement;
const shows = (index: number) => key(index).getAttribute('aria-label')?.replace(/^Key \d+: /, '');
const selected = () => screen.queryByRole('heading', { name: /^Key \d+|keys selected/ })?.textContent ?? null;
const strip = () => screen.queryByRole('group', { name: 'Typing keys' });
const toggle = (name: string) => within(strip() as HTMLElement).getByRole('switch', { name });

describe('typing keys onto the keymap', () => {
  it('puts the pressed key on the selected key, and shows the switches only while a key is selected', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(strip()).toBeNull();
    await user.click(key(0));
    expect(strip()).toBeTruthy();
    await user.keyboard('j');
    expect(shows(0)).toBe('J');
    await user.keyboard('{Control>}z{/Control}');
    expect(shows(0)).not.toBe('J');
  });

  it('goes by position: Ö on a Nordic layout places SEMI', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(key(0));
    fireEvent.keyDown(window, { key: 'ö', code: 'Semicolon' });
    expect(shows(0)).toBe(';');
  });

  it('moves to the next key when "Move to next key" is on', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(key(0));
    await user.click(toggle('Move to next key'));
    await user.keyboard('abc');
    expect([0, 1, 2].map(shows)).toEqual(['A', 'B', 'C']);
    expect(selected()).toMatch(/^Key 3 /);
  });

  it('keeps Esc and Backspace for the editor, unless "Type all keys" is on', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(key(0));
    await user.keyboard('{Escape}');
    expect(strip()).toBeNull();

    await user.click(key(0));
    await user.click(toggle('Type all keys'));
    await user.click(key(1));
    await user.keyboard('{Escape}');
    expect(shows(1)).toBe('Esc');
    await user.keyboard('{Backspace}');
    expect(shows(1)).toBe('Bksp');
    expect(strip()).toBeTruthy();
  });

  it('places a modifier pressed on its own, and ignores a held one', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(key(0));
    await user.keyboard('{Shift>}a{/Shift}');
    expect(shows(0)).toBe('A');
    await user.keyboard('{Shift}');
    expect(shows(0)).toMatch(/Shift|⇧/);
  });

  it('doesn’t place Ctrl after a Ctrl-click that selects more keys', async () => {
    const user = userEvent.setup();
    render(<App />);
    const before = [shows(0), shows(1)];
    await user.click(key(0));
    await user.keyboard('{Control>}');
    await user.click(key(1));
    await user.keyboard('{/Control}');
    expect([shows(0), shows(1)]).toEqual(before);
  });

  it('leaves text fields alone', async () => {
    const user = userEvent.setup();
    render(<App />);
    const before = shows(0);
    await user.click(key(0));
    await user.click(screen.getAllByRole('searchbox')[0] as HTMLElement);
    await user.keyboard('q');
    expect(shows(0)).toBe(before);
  });
});
