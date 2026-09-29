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

function dataTransfer() {
  const store = new Map<string, string>();
  return {
    dropEffect: 'none',
    effectAllowed: 'all',
    get types() {
      return [...store.keys()];
    },
    setData: (type: string, value: string) => void store.set(type, value),
    getData: (type: string) => store.get(type) ?? '',
  };
}

function drag(source: HTMLElement, target: HTMLElement) {
  const data = dataTransfer();
  fireEvent.dragStart(source, { dataTransfer: data });
  fireEvent.dragOver(target, { dataTransfer: data });
  fireEvent.drop(target, { dataTransfer: data });
}

const palette = () => within(screen.getByRole('region', { name: 'Key palette' }));
const keyButton = (name: string) => screen.getByRole('button', { name });
const encoder = () => within(screen.getByRole('group', { name: 'Encoders' })).getByRole('button');

describe('recently used', () => {
  it('remembers placed tiles, places them again, and clears them', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(palette().queryByRole('group', { name: 'Recently used' })).toBeNull();

    drag(palette().getByRole('button', { name: 'Place Tab (TAB)' }), keyButton('Key 0: Esc'));
    await user.click(palette().getByRole('button', { name: 'Behaviors' }));
    drag(palette().getByRole('button', { name: 'Place NUM (mo)' }), keyButton('Key 1: 1'));

    const recent = within(palette().getByRole('group', { name: 'Recently used' }));
    expect(recent.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Place recent NUM (mo)',
      'Place recent Tab (TAB)',
    ]);
    expect(JSON.parse(localStorage.getItem('zmk-editor.preferences.v1') ?? '{}').recent).toHaveLength(2);

    await user.click(keyButton('Key 2: 2'));
    await user.click(recent.getByRole('button', { name: 'Place recent Tab (TAB)' }));
    expect(keyButton('Key 2: Tab')).toBeTruthy();

    await user.click(palette().getByRole('button', { name: 'Clear recently used' }));
    expect(palette().queryByRole('group', { name: 'Recently used' })).toBeNull();
  });
});

describe('behavior search in the palette', () => {
  it('filters tiles and hides empty groups', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(palette().getByRole('searchbox', { name: 'Search the palette' }), 'blue');
    expect(palette().getByRole('group', { name: 'Bluetooth & output' })).toBeTruthy();
    expect(palette().queryByRole('group', { name: 'Layers' })).toBeNull();

    await user.clear(palette().getByRole('searchbox', { name: 'Search the palette' }));
    await user.type(palette().getByRole('searchbox', { name: 'Search the palette' }), 'zzzz');
    expect(palette().getByText('Nothing matches “zzzz”.')).toBeTruthy();
  });
});

describe('searchable behavior field', () => {
  it('filters behaviors as you type and picks one with the keyboard', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(keyButton('Key 1: 1'));
    const field = screen.getByRole('combobox', { name: 'Behavior' });
    expect((field as HTMLInputElement).value).toBe('Key press');

    await user.click(field);
    expect(field.getAttribute('aria-expanded')).toBe('true');
    await user.keyboard('toggle');
    const options = within(screen.getByRole('listbox', { name: 'Behavior' })).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^Toggle layer/), expect.stringMatching(/^Key toggle/)]),
    );
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: /^Key 1: .* \(tog\)$/ })).toBeTruthy();
  });

  it('picks with a click and closes on Esc without deselecting the key', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(keyButton('Key 1: 1'));
    await user.click(screen.getByRole('combobox', { name: 'Behavior' }));
    await user.click(screen.getByRole('option', { name: /^Sticky key/ }));
    expect(keyButton('Key 1: 1 (sticky)')).toBeTruthy();

    await user.click(screen.getByRole('combobox', { name: 'Behavior' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox', { name: 'Behavior' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Key 1 · BASE' })).toBeTruthy();
  });
});

describe('encoder drops', () => {
  it('sets one direction from a dropped key', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(palette().getByRole('searchbox', { name: 'Search the palette' }), 'PG_UP');
    drag(palette().getByRole('button', { name: /^Place .* \(PG_UP\)$/ }), within(encoder()).getByText(/↻/));
    expect(encoder().getAttribute('aria-label')).toMatch(/^Encoder 1: Vol- \/ PgUp$/);
    expect(screen.getByRole('heading', { name: /Encoder 1/ })).toBeTruthy();
  });

  it('explains that layer behaviors cannot go on an encoder', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(palette().getByRole('button', { name: 'Behaviors' }));
    drag(palette().getByRole('button', { name: 'Place NUM (mo)' }), within(encoder()).getByText(/↺/));
    expect(screen.getByRole('status').textContent).toMatch(/Only keys, Transparent and None/);
  });
});

describe('palette loose ends', () => {
  it('stops placing with Esc from the search box, after clearing the search', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(palette().getByRole('button', { name: 'Place A (A)' }));
    expect(palette().getByText(/Placing A/)).toBeTruthy();
    const search = palette().getByRole('searchbox', { name: 'Search the palette' });
    await user.type(search, 'esc');
    await user.keyboard('{Escape}');
    expect((search as HTMLInputElement).value).toBe('');
    expect(palette().getByText(/Placing A/)).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(palette().queryByText(/Placing A/)).toBeNull();
  });

  it('says the palette is hidden while it’s folded', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(palette().getByRole('button', { name: 'Hide palette' }));
    expect(palette().getByText(/The palette is hidden/)).toBeTruthy();
  });

  it('moves focus to the section a rail entry jumps to', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(palette().getByRole('button', { name: 'Numbers' }));
    expect(document.activeElement?.textContent).toBe('Numbers');
  });
});
