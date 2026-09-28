// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App.tsx';

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
    await user.selectOptions(screen.getByRole('combobox', { name: 'Behavior' }), 'mt');
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

  it('drops behaviors and transparent', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(palette().getByRole('button', { name: 'Behaviors' }));
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
