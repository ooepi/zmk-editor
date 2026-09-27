// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const stored = () => JSON.parse(localStorage.getItem('zmk-editor.config.v1') ?? '{}').config;
const canvasKey = (index: number) =>
  within(screen.getByRole('group', { name: 'Layout canvas' })).getByRole('button', { name: new RegExp(`^Key ${index}:`) });

async function openWizard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Lily58 ▾' }));
  await user.click(screen.getByRole('button', { name: 'Design your own keyboard' }));
}

async function type(user: ReturnType<typeof userEvent.setup>, label: string, text: string) {
  const field = screen.getByLabelText(label);
  await user.clear(field);
  await user.type(field, text);
}

describe('Design your own keyboard', () => {
  it('creates a direct-wired macropad from scratch', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<App />);
    await openWizard(user);

    await type(user, 'Keyboard name', 'Test Pad');
    expect((screen.getByLabelText('Id') as HTMLInputElement).value).toBe('test_pad');
    await user.click(screen.getByLabelText('Split keyboard (two halves)'));
    await user.click(screen.getByLabelText('Direct (one pin per key)'));
    await type(user, 'Rows', '1');
    await type(user, 'Columns', '3');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Wiring: one pin with its field, one on the pinout, one more with its field.
    await user.selectOptions(screen.getByLabelText('Input 0'), '4');
    await user.click(screen.getByLabelText('Input 1'));
    await user.click(screen.getByRole('button', { name: 'D5' }));
    await user.selectOptions(screen.getByLabelText('Input 2'), '6');
    expect(screen.getByRole('button', { name: 'D5: Input 1' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Layout: drop the last key.
    await user.click(canvasKey(2));
    await user.click(screen.getByRole('button', { name: 'Delete key' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Review: an unused input is only a warning; the files are listed.
    expect(screen.getByText('Input 2 has no key.')).toBeTruthy();
    expect(screen.getByText('config/boards/shields/test_pad/test_pad.overlay')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Create keyboard' }));

    expect(screen.getByRole('button', { name: 'Test Pad ▾' })).toBeTruthy();
    const config = stored();
    expect(config.hardware.wiring).toEqual({ kind: 'direct', pins: [4, 5, 6] });
    expect(config.build.include).toEqual([{ board: 'nice_nano_v2', shield: 'test_pad' }]);
    expect(config.keymap.layers[0].bindings).toHaveLength(2);
  });

  it('won’t create a keyboard with a pin used twice', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openWizard(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.selectOptions(screen.getByLabelText('Left row 0'), '4');
    await user.selectOptions(screen.getByLabelText('Left row 1'), '4');
    expect(screen.getByText('D4 is used for both Row 0 and Row 1 on the left half.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Create keyboard' })).toHaveProperty('disabled', true);
  });

  it('stops at Basics when the matrix needs more pins than the controller has', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openWizard(user);
    await type(user, 'Columns', '16');
    expect(screen.getByText('A 3 × 16 matrix needs 19 pins per half, but the controller has 18.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);
  });
});
