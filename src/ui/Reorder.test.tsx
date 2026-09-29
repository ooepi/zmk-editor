// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App.tsx';

beforeEach(() => localStorage.clear());
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

/** Drags `source` onto the first half of `target` (jsdom has no layout, so every drop lands "before"). */
function drag(source: HTMLElement, target: HTMLElement) {
  const data = dataTransfer();
  fireEvent.dragStart(source, { dataTransfer: data });
  fireEvent.dragOver(target, { dataTransfer: data });
  fireEvent.drop(target, { dataTransfer: data });
  fireEvent.dragEnd(source, { dataTransfer: data });
}

const tabs = () => screen.getAllByRole('tab');
const tabNames = () => tabs().map((t) => t.textContent);
const steps = () => within(screen.getByRole('list', { name: 'Macro steps' })).getAllByRole('listitem');
const labels = () => steps().map((s) => s.querySelector('.step-label')?.textContent);

describe('drag to reorder', () => {
  it('reorders layer tabs and keeps layer keys pointing at the same layers', async () => {
    const user = userEvent.setup();
    render(<App />);
    drag(tabs()[4] as HTMLElement, tabs()[1] as HTMLElement);
    expect(tabNames()).toEqual(['0BASE', '1NUM', '2NAV', '3PROG', '4QWER', '5MOUS']);
    expect(screen.getByRole('button', { name: 'Key 52: NAV (mo)' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(tabNames()).toEqual(['0BASE', '1NAV', '2PROG', '3QWER', '4NUM', '5MOUS']);
  });

  it('reorders macro steps and selects the moved step', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Macros (0)' }));
    await user.click(screen.getByRole('button', { name: '+ New macro' }));
    await user.type(screen.getByRole('textbox', { name: 'Text to type' }), 'abc{Enter}');
    expect(labels()).toEqual(['Tap mode', 'A', 'B', 'C']);

    drag(steps()[2] as HTMLElement, steps()[0] as HTMLElement);
    expect(labels()).toEqual(['B', 'Tap mode', 'A', 'C']);
    expect(within(steps()[0] as HTMLElement).getAllByRole('button')[0]?.getAttribute('aria-pressed')).toBe('true');
  });

  it('reorders tap-dance taps by dragging or with the arrow buttons', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Behaviors (2)' }));
    await user.click(screen.getByRole('button', { name: 'New behavior' }));
    await user.click(screen.getByRole('button', { name: '+ Tap-dance' }));
    await user.click(screen.getByRole('button', { name: '+ Add tap' }));
    // Each card shows what its tap sends; click a card to edit it below the row.
    const sends = (name: string) => screen.getByRole('button', { name: `Edit ${name}` }).querySelector('kbd')?.textContent;
    const setSource = async (name: string, text: string) => {
      await user.click(screen.getByRole('button', { name: `Edit ${name}` }));
      const field = screen.getByRole('textbox', { name: `${name}: Source` });
      await user.clear(field);
      await user.type(field, `${text}{Enter}`);
    };
    await setSource('1 tap', '&kp X');
    await setSource('2 taps', '&kp Y');
    await setSource('3 taps', '&kp Z');

    const card = (name: string) => screen.getByText(name).closest('.td-card') as HTMLElement;
    const header = (name: string) => card(name).querySelector('.tap-header') as HTMLElement;
    drag(header('3 taps'), card('1 tap'));
    expect(['1 tap', '2 taps', '3 taps'].map(sends)).toEqual(['Z', 'X', 'Y']);
    // The edited tap (Z, last edited) moved with its card.
    expect(screen.getByRole('button', { name: 'Edit 1 tap' }).getAttribute('aria-pressed')).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Move 1 tap down' }));
    expect(['1 tap', '2 taps', '3 taps'].map(sends)).toEqual(['X', 'Z', 'Y']);
    expect((screen.getByRole('button', { name: 'Move 1 tap up' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps drags inside their own list', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Macros (0)' }));
    await user.click(screen.getByRole('button', { name: '+ New macro' }));
    await user.type(screen.getByRole('textbox', { name: 'Text to type' }), 'ab{Enter}');
    const before = labels();

    // A layer-tab drag dropped on a macro step changes nothing.
    await user.click(screen.getByRole('button', { name: 'Keymap' }));
    const data = dataTransfer();
    fireEvent.dragStart(tabs()[2] as HTMLElement, { dataTransfer: data });
    await user.click(screen.getByRole('button', { name: /^Macros/ }));
    fireEvent.dragOver(steps()[0] as HTMLElement, { dataTransfer: data });
    fireEvent.drop(steps()[0] as HTMLElement, { dataTransfer: data });
    expect(labels()).toEqual(before);
    await user.click(screen.getByRole('button', { name: 'Keymap' }));
    expect(tabNames()).toEqual(['0BASE', '1NAV', '2PROG', '3QWER', '4NUM', '5MOUS']);
  });
});
