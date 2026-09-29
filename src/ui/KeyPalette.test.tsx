// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import { chooseBehavior } from './testUtils.ts';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

/** jsdom has no DataTransfer; this stores data like a browser does during one drag. */
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

const keyButton = (name: string) => screen.getByRole('button', { name });
const palette = () => within(screen.getByRole('region', { name: 'Key palette' }));

function drag(source: HTMLElement, target: HTMLElement, { altKey = false } = {}) {
  const data = dataTransfer();
  fireEvent.dragStart(source, { dataTransfer: data });
  // jsdom has no DragEvent, so modifier keys have to be set on the plain event.
  for (const make of [createEvent.dragOver, createEvent.drop]) {
    const event = make(target, { dataTransfer: data });
    Object.defineProperty(event, 'altKey', { value: altKey });
    fireEvent(target, event);
  }
}

describe('key palette', () => {
  it('drops a key from the palette onto a key', () => {
    render(<App />);
    drag(palette().getByRole('button', { name: 'Place Tab (TAB)' }), keyButton('Key 0: Esc'));
    expect(keyButton('Key 0: Tab')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Key 0 · BASE' })).toBeTruthy();
  });

  it('keeps a hold-tap and replaces its tap key', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(keyButton('Key 54: Space'));
    await chooseBehavior(user, 'mt');
    expect(keyButton('Key 54: Space (Shift)')).toBeTruthy();
    drag(palette().getByRole('button', { name: 'Place B (B)' }), keyButton('Key 54: Space (Shift)'));
    expect(keyButton('Key 54: B (Shift)')).toBeTruthy();
  });

  it('places keys with the held modifiers', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(palette().getByRole('button', { name: 'Hold Left Ctrl with placed keys' }));
    drag(palette().getByRole('button', { name: 'Place Ctl+C (LC(C))' }), keyButton('Key 0: Esc'));
    expect(keyButton('Key 0: Ctl+C')).toBeTruthy();
  });

  it('drops behaviors and transparent', () => {
    render(<App />);
    drag(palette().getByRole('button', { name: 'Place NUM (mo)' }), keyButton('Key 0: Esc'));
    expect(keyButton('Key 0: NUM (mo)')).toBeTruthy();
    drag(palette().getByRole('button', { name: 'Place Transparent' }), keyButton('Key 1: 1'));
    expect(keyButton('Key 1: ▽')).toBeTruthy();
  });

  it('swaps keys, copies with Alt, and undoes', async () => {
    const user = userEvent.setup();
    render(<App />);
    drag(keyButton('Key 0: Esc'), keyButton('Key 1: 1'));
    expect(keyButton('Key 0: 1')).toBeTruthy();
    expect(keyButton('Key 1: Esc')).toBeTruthy();

    drag(keyButton('Key 1: Esc'), keyButton('Key 2: 2'), { altKey: true });
    expect(keyButton('Key 1: Esc')).toBeTruthy();
    expect(keyButton('Key 2: Esc')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(keyButton('Key 0: Esc')).toBeTruthy();
    expect(keyButton('Key 2: 2')).toBeTruthy();
  });

  it('puts a clicked tile on the selected key', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(keyButton('Key 0: Esc'));
    await user.click(palette().getByRole('button', { name: 'Place Tab (TAB)' }));
    expect(keyButton('Key 0: Tab')).toBeTruthy();
    expect(keyButton('Key 0: Tab').getAttribute('aria-pressed')).toBe('true');
  });

  it('arms a tile without a selected key, places it on clicked keys, and stops on Esc', async () => {
    const user = userEvent.setup();
    render(<App />);
    const tab = palette().getByRole('button', { name: 'Place Tab (TAB)' });
    await user.click(tab);
    expect(tab.getAttribute('aria-pressed')).toBe('true');
    await user.click(keyButton('Key 0: Esc'));
    await user.click(keyButton('Key 1: 1'));
    expect(keyButton('Key 0: Tab')).toBeTruthy();
    expect(keyButton('Key 1: Tab')).toBeTruthy();

    await user.keyboard('{Escape}');
    expect(tab.getAttribute('aria-pressed')).toBe('false');
    await user.click(keyButton('Key 2: 2'));
    expect(keyButton('Key 2: 2').getAttribute('aria-pressed')).toBe('true');
  });

  it('does not drag keys outside the keymap view', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Combos/ }));
    expect(screen.queryByRole('region', { name: 'Key palette' })).toBeNull();
    expect(keyButton('Key 0: Esc').getAttribute('draggable')).toBeNull();
  });
});

describe('palette layout', () => {
  it('shows every section in one list and jumps to a category from the rail', async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled(this.id);
    };
    const user = userEvent.setup();
    render(<App />);
    expect(palette().getByRole('heading', { name: 'Letters' })).toBeTruthy();
    expect(within(palette().getByRole('group', { name: 'Layers' })).getByRole('button', { name: 'Place NUM (mo)' })).toBeTruthy();
    const rail = within(palette().getByRole('navigation', { name: 'Palette categories' }));
    await user.click(rail.getByRole('button', { name: 'Numbers' }));
    expect(scrolled).toHaveBeenLastCalledWith('palette-keys-numbers');
    expect(rail.getByRole('button', { name: 'Numbers' }).getAttribute('aria-current')).toBe('true');
    expect(palette().getByRole('heading', { name: 'Letters' })).toBeTruthy();
  });

  it('narrows to a Keys section while searching', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(palette().getByRole('searchbox', { name: 'Search the palette' }), 'N1');
    expect(palette().queryByRole('heading', { name: 'Letters' })).toBeNull();
    expect(within(palette().getByRole('group', { name: 'Keys' })).getByRole('button', { name: 'Place 1 (N1)' })).toBeTruthy();
  });

  it('pins Transparent and None above the list', () => {
    render(<App />);
    const special = within(palette().getByRole('group', { name: 'Special' }));
    expect(special.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Place Transparent', 'Place None']);
  });

  it('keeps the modifiers in their own labelled group', () => {
    render(<App />);
    const mods = palette().getByRole('group', { name: 'Hold with placed keys:' });
    expect(within(mods).getAllByRole('button')).toHaveLength(8);
  });
});

describe('palette status', () => {
  const status = () => within(palette().getByRole('status'));

  it('says what a click will do in each mode', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(status().getByText(/Select a key, then click a tile/)).toBeTruthy();
    await user.click(keyButton('Key 25: A'));
    expect(status().getByText(/Click a tile to put it on key 25, or drag a tile onto any key\./)).toBeTruthy();
    await user.keyboard('{Control>}');
    await user.click(keyButton('Key 26: R'));
    await user.keyboard('{/Control}');
    expect(status().getByText(/on the 2 selected keys/)).toBeTruthy();
  });

  it('names the armed tile and stops placing it', async () => {
    const user = userEvent.setup();
    render(<App />);
    const tab = palette().getByRole('button', { name: 'Place Tab (TAB)' });
    await user.click(tab);
    expect(status().getByText(/Placing Tab: click keys to put it on them\./)).toBeTruthy();
    await user.click(status().getByRole('button', { name: 'Stop placing' }));
    expect(tab.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('modifiers on palette tiles', () => {
  it('keeps the key readable and shows the held modifiers on the small line', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(palette().getByRole('button', { name: 'Hold Left Ctrl with placed keys' }));
    await user.click(palette().getByRole('button', { name: 'Hold Left Shift with placed keys' }));
    const tile = palette().getByRole('button', { name: 'Place Ctl+Sft+A (LC(LS(A)))' });
    expect(tile.querySelector('.palette-tile-main')?.textContent).toBe('A');
    expect(tile.querySelector('.palette-tile-sub')?.textContent).toBe('Ctl+Sft');
  });
});

describe('top bar', () => {
  it('switches between the dark and light themes', async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByRole('switch', { name: 'Dark theme' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await user.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('links to Buy me a coffee in a new tab', () => {
    render(<App />);
    const link = screen.getByRole('link', { name: 'Buy me a coffee' });
    expect(link.getAttribute('href')).toBe('https://www.buymeacoffee.com/gristone');
    expect(link.getAttribute('target')).toBe('_blank');
  });
});
