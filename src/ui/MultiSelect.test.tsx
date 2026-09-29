// @vitest-environment jsdom
import { act, cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import { HOVER_SWITCH_MS } from './components/LayerRail.tsx';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const board = () => screen.getByRole('group', { name: 'Keyboard layout' });
/** "Key 3: E" → "E": what key `index` shows on the current layer. */
const key = (index: number) => within(board()).getAllByRole('button')[index] as HTMLElement;
const shows = (index: number) => key(index).getAttribute('aria-label')?.replace(/^Key \d+: /, '');
const tab = (name: RegExp) => screen.getAllByRole('tab').find((t) => name.test(t.textContent ?? '')) as HTMLElement;
const palette = () => within(screen.getByRole('region', { name: 'Key palette' }));

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

/** jsdom has no PointerEvent; set the pointer fields on a plain event. */
function pointer(type: 'pointerDown' | 'pointerMove' | 'pointerUp', target: HTMLElement, x: number, y: number) {
  const event = createEvent[type](target);
  for (const [name, value] of Object.entries({ clientX: x, clientY: y, button: 0, pointerId: 1 })) {
    Object.defineProperty(event, name, { value });
  }
  fireEvent(target, event);
}

describe('selecting several keys', () => {
  it('adds keys with Ctrl-click and edits them together', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(key(0));
    await user.keyboard('{Control>}');
    await user.click(key(1));
    await user.click(key(2));
    await user.keyboard('{/Control}');
    expect(screen.getByRole('heading', { name: '3 keys selected · BASE' })).toBeTruthy();

    await user.click(palette().getByRole('button', { name: 'Place Tab (TAB)' }));
    expect([0, 1, 2].map(shows)).toEqual(['Tab', 'Tab', 'Tab']);

    await user.keyboard('{Delete}');
    expect([0, 1, 2].map(shows)).toEqual(['▽', '▽', '▽']);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect([0, 1, 2].map(shows)).toEqual(['Tab', 'Tab', 'Tab']);
  });

  it('removes a key with Ctrl-click and goes back to the single-key editor', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(key(0));
    await user.keyboard('{Control>}');
    await user.click(key(1));
    await user.click(key(0));
    await user.keyboard('{/Control}');
    expect(screen.getByRole('heading', { name: 'Key 1 · BASE' })).toBeTruthy();
  });

  it('selects keys with a box, all keys with Ctrl+A, and clears with a click on empty space', async () => {
    const user = userEvent.setup();
    render(<App />);
    vi.spyOn(board(), 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 500 } as DOMRect);
    pointer('pointerDown', board(), 0, 0);
    pointer('pointerMove', board(), 1000, 500);
    pointer('pointerUp', board(), 1000, 500);
    expect(screen.getByRole('heading', { name: '58 keys selected · BASE' })).toBeTruthy();

    pointer('pointerDown', board(), 2, 2);
    pointer('pointerUp', board(), 2, 2);
    expect(screen.queryByRole('heading', { name: /keys selected/ })).toBeNull();

    await user.keyboard('{Control>}a{/Control}');
    expect(screen.getByRole('heading', { name: '58 keys selected · BASE' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('heading', { name: /keys selected/ })).toBeNull();
  });
});

describe('copy and paste', () => {
  it('pastes several keys into the same positions on another layer', async () => {
    const user = userEvent.setup();
    render(<App />);
    const base = [0, 1].map(shows);
    await user.click(key(0));
    await user.keyboard('{Control>}');
    await user.click(key(1));
    await user.keyboard('c{/Control}');

    await user.click(tab(/PROG/));
    expect([0, 1].map(shows)).not.toEqual(base);
    await user.keyboard('{Control>}v{/Control}');
    expect([0, 1].map(shows)).toEqual(base);
  });

  it('pastes one key onto every selected key and cuts keys', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(key(0));
    await user.click(screen.getByRole('button', { name: 'Cut' }));
    expect(shows(0)).toBe('▽');

    await user.click(key(3));
    await user.keyboard('{Control>}');
    await user.click(key(4));
    await user.keyboard('v{/Control}');
    expect([3, 4].map(shows)).toEqual(['Esc', 'Esc']);
  });

  it('explains why pasting on the same layer does nothing', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(key(0));
    await user.keyboard('{Control>}');
    await user.click(key(1));
    await user.keyboard('cv{/Control}');
    expect(screen.getByRole('status').textContent).toMatch(/Switch to another layer/);
  });
});

describe('dragging across layers', () => {
  it('switches layer when a drag rests on a tab, and copies the key there', () => {
    vi.useFakeTimers();
    render(<App />);
    const data = dataTransfer();
    fireEvent.dragStart(key(0), { dataTransfer: data });
    fireEvent.dragEnter(tab(/PROG/), { dataTransfer: data });
    act(() => void vi.advanceTimersByTime(HOVER_SWITCH_MS));
    expect(tab(/PROG/).getAttribute('aria-selected')).toBe('true');

    fireEvent.dragOver(key(5), { dataTransfer: data });
    fireEvent.drop(key(5), { dataTransfer: data });
    expect(shows(5)).toBe('Esc');

    fireEvent.click(tab(/BASE/));
    expect(shows(0)).toBe('Esc');
  });

  it('does not switch when the drag leaves the tab early', () => {
    vi.useFakeTimers();
    render(<App />);
    const data = dataTransfer();
    fireEvent.dragStart(key(0), { dataTransfer: data });
    fireEvent.dragEnter(tab(/PROG/), { dataTransfer: data });
    fireEvent.dragLeave(tab(/PROG/), { dataTransfer: data });
    act(() => void vi.advanceTimersByTime(HOVER_SWITCH_MS));
    expect(tab(/BASE/).getAttribute('aria-selected')).toBe('true');
  });
});
