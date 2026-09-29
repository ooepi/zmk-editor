// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import { reloadPreferences } from './state/preferences.ts';
import { chooseBehavior } from './testUtils.ts';

beforeEach(() => {
  localStorage.clear();
  reloadPreferences();
});
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
    const mods = palette().getByRole('group', { name: 'Add modifiers' });
    expect(within(mods).getAllByRole('button')).toHaveLength(8);
  });
});

describe('palette status', () => {
  const status = () => within(palette().getByText(/Select a key|Click a tile|Placing/).closest('p') as HTMLElement);

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

describe('palette search', () => {
  it('starts a search at the top of the list and clears the highlighted category', async () => {
    Element.prototype.scrollIntoView = () => undefined;
    const user = userEvent.setup();
    render(<App />);
    const list = palette().getByRole('region', { name: 'Palette tiles' });
    let top = 0;
    Object.defineProperty(list, 'scrollTop', { get: () => top, set: (v: number) => (top = v), configurable: true });
    const rail = within(palette().getByRole('navigation', { name: 'Palette categories' }));
    await user.click(rail.getByRole('button', { name: 'Layers' }));
    top = 1500;
    await user.type(palette().getByRole('searchbox', { name: 'Search the palette' }), 'a');
    expect(top).toBe(0);
    expect(rail.queryAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'true')).toEqual([]);
  });

  it('finds Transparent and None by name', async () => {
    const user = userEvent.setup();
    render(<App />);
    const search = palette().getByRole('searchbox', { name: 'Search the palette' });
    await user.type(search, 'trans');
    expect(within(palette().getByRole('group', { name: 'Special' })).getByRole('button', { name: 'Place Transparent' })).toBeTruthy();
    await user.clear(search);
    await user.type(search, 'esc');
    expect(palette().queryByRole('group', { name: 'Special' })).toBeNull();
  });
});

describe('armed tile names', () => {
  it('names special tiles in words', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(palette().getByRole('button', { name: 'Place Transparent' }));
    expect(palette().getByText(/Placing Transparent: click keys/)).toBeTruthy();
  });

  it('includes the small line, so a Shift hold-tap is not just "A"', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(palette().getByRole('button', { name: 'Place NUM (mo)' }));
    expect(palette().getByText(/Placing NUM \(mo\): click keys/)).toBeTruthy();
  });
});

describe('collapsing the palette', () => {
  it('collapses to its status line, remembers it, and still places an armed tile', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.click(palette().getByRole('button', { name: 'Place Tab (TAB)' }));
    await user.click(palette().getByRole('button', { name: 'Hide palette' }));
    expect(palette().queryByRole('searchbox', { name: 'Search the palette' })).toBeNull();
    expect(palette().getByText(/Placing Tab/)).toBeTruthy();
    await user.click(keyButton('Key 0: Esc'));
    expect(keyButton('Key 0: Tab')).toBeTruthy();
    unmount();
    render(<App />);
    const show = palette().getByRole('button', { name: 'Show palette' });
    expect(show.getAttribute('aria-expanded')).toBe('false');
    await user.click(show);
    expect(palette().getByRole('searchbox', { name: 'Search the palette' })).toBeTruthy();
  });
});

describe('modifier bar', () => {
  it('says which modifiers key tiles will carry, and clears them', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(palette().getByRole('button', { name: 'Hold Left Ctrl with placed keys' }));
    await user.click(palette().getByRole('button', { name: 'Hold Left Shift with placed keys' }));
    expect(palette().getByText('Key tiles will send Ctl+Sft with the key.')).toBeTruthy();
    expect(palette().getByRole('button', { name: 'Place NUM (mo)' })).toBeTruthy();
    await user.click(palette().getByRole('button', { name: 'Clear modifiers' }));
    expect(palette().getByRole('button', { name: 'Place A (A)' })).toBeTruthy();
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
