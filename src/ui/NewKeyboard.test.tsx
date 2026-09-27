// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRO_MICRO_PINS } from '../core/hardware/controllers.ts';
import { newHardwareConfig } from '../core/hardware/config.ts';
import { DEFAULT_BASICS, gridHardware } from '../core/hardware/grid.ts';
import { testPad } from '../core/hardware/testFixtures.ts';
import type { KeyboardHardware } from '../core/hardware/types.ts';
import { createCombo } from '../core/keymap/comboEdit.ts';
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

  it('doesn’t get stuck on Basics editing a direct-wired keyboard with a staggered key', async () => {
    const hw: KeyboardHardware = {
      ...gridHardware({ ...DEFAULT_BASICS, name: 'direct18', displayName: 'Direct18', split: false, wiring: 'direct', rows: 3, cols: 6 }),
      wiring: { kind: 'direct', pins: [...PRO_MICRO_PINS] },
    };
    // One key nudged off its grid position: basicsOf must not guess a bogus rows/cols from this.
    const staggered: KeyboardHardware = { ...hw, keys: hw.keys.map((k, i) => (i === 0 ? { ...k, y: k.y + 25 } : k)) };
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config: newHardwareConfig(staggered, 'v0.3') }));

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Direct18 ▾' }));
    await user.click(screen.getByRole('button', { name: 'Edit hardware' }));
    expect(screen.getByText('18 inputs. Add or remove keys on the Layout step.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', false);
  });

  it('ignores Ctrl+Z while the wizard is open, so undo can’t change the config behind its draft', async () => {
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config: newHardwareConfig(testPad, 'v0.3') }));
    const user = userEvent.setup();
    render(<App />);

    // Build some undo history before opening the wizard.
    await user.click(within(screen.getByRole('group', { name: 'Keyboard layout' })).getByRole('button', { name: /^Key 0:/ }));
    await user.keyboard('{Delete}');

    await user.click(screen.getByRole('button', { name: 'Test Pad ▾' }));
    await user.click(screen.getByRole('button', { name: 'Edit hardware' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    const before = stored();
    await user.keyboard('{Control>}z{/Control}');
    expect(stored()).toEqual(before);
    expect(screen.getByText('Edit hardware · Test Pad')).toBeTruthy();

    for (const name of ['Undo', 'Redo', 'Open files', 'Reset to demo']) {
      expect(screen.getByRole('button', { name })).toHaveProperty('disabled', true);
    }
  });

  it('confirms before rebuilding the grid when keys were rearranged, even with no pins picked', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    render(<App />);
    await openWizard(user);
    await type(user, 'Columns', '3');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.click(canvasKey(0));
    await user.click(screen.getByRole('button', { name: 'Delete key' }));

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await type(user, 'Columns', '4');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(confirm).toHaveBeenCalledWith('Changing the size or wiring starts the keys and pins over. Continue?');
    // Declined: leaveBasics returned early, so we're still on the Basics step.
    expect(screen.getByLabelText('Columns')).toBeTruthy();
  });

  it('doesn’t silently re-enable “wired differently” after unticking it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openWizard(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.click(screen.getByLabelText('The right half is wired differently'));
    await user.click(screen.getByLabelText('Right row 0'));
    await user.click(screen.getByLabelText('The right half is wired differently'));
    await user.click(screen.getByRole('button', { name: 'D5' }));

    expect(screen.getByLabelText('The right half is wired differently')).toHaveProperty('checked', false);
  });

  it('needs a field clicked before a pin does anything, and names which field it’ll fill', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openWizard(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText(/Click a pin field, then a pin\./)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'D4' }));
    expect(screen.getByLabelText('Left row 0')).toHaveProperty('value', '');

    await user.click(screen.getByLabelText('Left row 0'));
    expect(screen.getByText(/Picking a pin for Left row 0\./)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'D4' }));
    expect(screen.getByLabelText('Left row 0')).toHaveProperty('value', '4');
  });
});

describe('Edit hardware', () => {
  it('deletes a key later, keeps the keymap and combos in step, and can be undone', async () => {
    const hw = {
      ...gridHardware({ ...DEFAULT_BASICS, name: 'test_pad', displayName: 'Test Pad', split: false, wiring: 'direct', rows: 1, cols: 3 }),
      wiring: { kind: 'direct' as const, pins: [4, 5, 6] },
    };
    const config = newHardwareConfig(hw, 'v0.3');
    config.keymap = { ...config.keymap, combos: [createCombo(config.keymap, [1, 2])] };
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config }));

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Test Pad ▾' }));
    await user.click(screen.getByRole('button', { name: 'Edit hardware' }));
    expect(screen.getByLabelText('Id')).toHaveProperty('disabled', true);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(canvasKey(0));
    await user.click(screen.getByRole('button', { name: 'Delete key' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Save hardware' }));

    expect(screen.getByRole('status').textContent).toMatch(/Saved the keyboard’s hardware/);
    const saved = stored();
    expect(saved.keymap.layers[0].bindings.map((b: { params: string[] }) => b.params[0])).toEqual(['W', 'E']);
    expect(saved.keymap.combos[0].keyPositions).toEqual(['0', '1']);

    await user.keyboard('{Control>}z{/Control}');
    expect(stored().hardware.keys).toHaveLength(3);
  });
});
