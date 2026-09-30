// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newHardwareConfig } from '../core/hardware/config.ts';
import { testPad } from '../core/hardware/testFixtures.ts';
import { App } from './App.tsx';
import { reloadPreferences } from './state/preferences.ts';

beforeEach(() => {
  localStorage.clear();
  reloadPreferences();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const canvas = () => within(screen.getByRole('group', { name: 'Layout canvas' }));
const key = (index: number) => canvas().getByRole('button', { name: new RegExp(`^Key ${index}:`) });
const label = (index: number) =>
  key(index)
    .getAttribute('aria-label')
    ?.replace(/^Key \d+: /, '');
const panel = () => within(screen.getByRole('complementary', { name: 'Key settings' }));

/** A new 3×6 split (keys 0–5 left row 0, 6–11 right row 0, …), in the Layout step. */
async function layoutStep(user: ReturnType<typeof userEvent.setup>) {
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Change keyboard: Lily58' }));
  await user.click(screen.getByRole('button', { name: 'Design your own keyboard' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
}

const select = (...indices: number[]) => {
  fireEvent.pointerDown(key(indices[0] ?? 0));
  for (const i of indices.slice(1)) fireEvent.pointerDown(key(i), { ctrlKey: true });
};

describe('Number from positions', () => {
  it('gives every key its row and column back from where it sits, after asking', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    await layoutStep(user);
    select(0);
    await user.clear(panel().getByLabelText('Row'));
    await user.type(panel().getByLabelText('Row'), '2');
    expect(label(0)).toBe('2,0');
    await user.click(panel().getByRole('button', { name: 'Number from positions' }));
    expect(confirm.mock.calls[0]?.[0]).toContain('row and column');
    expect([0, 1, 6, 12].map(label)).toEqual(['0,0', '0,1', '0,0', '1,0']);
  });

  it('leaves the keys alone when not confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    await layoutStep(user);
    select(0);
    await user.clear(panel().getByLabelText('Row'));
    await user.type(panel().getByLabelText('Row'), '2');
    await user.click(panel().getByRole('button', { name: 'Number from positions' }));
    expect(label(0)).toBe('2,0');
  });
});

describe('Row and column for several keys', () => {
  it('shows what the selected keys share, and sets it on all of them', async () => {
    const user = userEvent.setup();
    await layoutStep(user);
    select(0, 1, 2);
    expect(panel().getByText('3 keys selected.', { exact: false })).toBeTruthy();
    expect(panel().getByLabelText('Row')).toHaveProperty('value', '0');
    // Their columns differ.
    expect(panel().getByLabelText('Column')).toHaveProperty('value', '');
    await user.clear(panel().getByLabelText('Row'));
    await user.type(panel().getByLabelText('Row'), '2');
    expect([0, 1, 2].map(label)).toEqual(['2,0', '2,1', '2,2']);
    await user.type(panel().getByLabelText('Column'), '4');
    expect([0, 1, 2].map(label)).toEqual(['2,4', '2,4', '2,4']);
    // Other keys stay where they were.
    expect(label(3)).toBe('0,3');
  });

  it('moves the selected keys to the other half', async () => {
    const user = userEvent.setup();
    await layoutStep(user);
    select(0, 1);
    await user.selectOptions(panel().getByLabelText('Half'), 'right');
    select(0);
    expect(panel().getByLabelText('Half')).toHaveProperty('value', 'right');
  });

  it('has no row or column for direct-wired keys, but can number their inputs', async () => {
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config: newHardwareConfig(testPad, 'v0.3') }));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Change keyboard: Test Pad' }));
    await user.click(screen.getByRole('button', { name: 'Edit hardware' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    select(0, 1);
    expect(panel().queryByLabelText('Row')).toBeNull();
    expect(panel().getByRole('button', { name: 'Number from positions' })).toBeTruthy();
  });
});
