// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const key = (name: string) => screen.getByRole('button', { name });
const banner = () => screen.getByRole('region', { name: 'Combo keys' });

async function newCombo() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Combos (0)' }));
  await user.click(screen.getByRole('button', { name: '+ New combo' }));
  return user;
}

describe('making a combo', () => {
  it('asks for keys in a banner and counts them', async () => {
    const user = await newCombo();
    expect(within(banner()).getByText(/Click the keys for this combo/)).toBeTruthy();
    await user.click(key('Key 13: Q'));
    await user.click(key('Key 14: W'));
    expect(within(banner()).getByText('2 keys')).toBeTruthy();
  });

  it('finishes with Done: the editor closes, nothing stays highlighted, and it says so', async () => {
    const user = await newCombo();
    await user.click(key('Key 13: Q'));
    await user.click(key('Key 14: W'));
    // Fake only the toast's timer, and press Done synchronously: Testing Library's async
    // helpers wait on a real setTimeout, which fake timers would never fire.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(within(banner()).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('region', { name: 'Combo keys' })).toBeNull();
    expect(key('Key 13: Q').className).not.toContain('highlighted');
    expect(screen.getByRole('status').textContent).toMatch(/Combo saved/);
    const item = within(screen.getByRole('list', { name: 'Combos' })).getByRole('button');
    expect(within(item).getByText('Q')).toBeTruthy();
    expect(within(item).getByText('W')).toBeTruthy();
    expect(within(item).getByText('Esc')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(4000));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('finishes with Esc too', async () => {
    const user = await newCombo();
    await user.click(key('Key 13: Q'));
    await user.click(key('Key 14: W'));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Combo keys' })).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/Combo saved/);
  });

  it('will not finish with fewer than two keys, and says why', async () => {
    const user = await newCombo();
    await user.click(key('Key 13: Q'));
    await user.click(within(banner()).getByRole('button', { name: 'Done' }));
    expect(banner()).toBeTruthy();
    expect(within(banner()).getByRole('alert').textContent).toBe('Pick at least two keys, or delete this combo.');
    await user.keyboard('{Escape}');
    expect(banner()).toBeTruthy();
  });

  it('closes the editor if undo removes the combo', async () => {
    const user = await newCombo();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryByRole('region', { name: 'Combo keys' })).toBeNull();
  });
});
