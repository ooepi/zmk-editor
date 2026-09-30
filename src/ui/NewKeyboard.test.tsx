// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRO_MICRO } from '../core/hardware/interconnects.ts';
import { newHardwareConfig } from '../core/hardware/config.ts';
import { DEFAULT_BASICS, gridHardware } from '../core/hardware/grid.ts';
import { testPad, testSplit } from '../core/hardware/testFixtures.ts';
import type { KeyboardHardware } from '../core/hardware/types.ts';
import { createCombo } from '../core/keymap/comboEdit.ts';
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

const stored = () => JSON.parse(localStorage.getItem('zmk-editor.config.v1') ?? '{}').config;
const canvasKey = (index: number) =>
  within(screen.getByRole('group', { name: 'Layout canvas' })).getByRole('button', { name: new RegExp(`^Key ${index}:`) });

async function openWizard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Change keyboard: Lily58' }));
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

    expect(screen.getByRole('button', { name: 'Change keyboard: Test Pad' })).toBeTruthy();
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
    expect(screen.getByText('A 3 × 16 matrix needs 19 pins per half, but a Pro Micro has 18.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);
  });

  it('doesn’t get stuck on Basics editing a direct-wired keyboard with a staggered key', async () => {
    const hw: KeyboardHardware = {
      ...gridHardware({ ...DEFAULT_BASICS, name: 'direct18', displayName: 'Direct18', split: false, wiring: 'direct', rows: 3, cols: 6 }),
      wiring: { kind: 'direct', pins: [...PRO_MICRO.pins] },
    };
    // One key nudged off its grid position: basicsOf must not guess a bogus rows/cols from this.
    const staggered: KeyboardHardware = { ...hw, keys: hw.keys.map((k, i) => (i === 0 ? { ...k, y: k.y + 25 } : k)) };
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config: newHardwareConfig(staggered, 'v0.3') }));

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Change keyboard: Direct18' }));
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

    await user.click(screen.getByRole('button', { name: 'Change keyboard: Test Pad' }));
    await user.click(screen.getByRole('button', { name: 'Edit hardware' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    const before = stored();
    await user.keyboard('{Control>}z{/Control}');
    expect(stored()).toEqual(before);
    expect(screen.getByText('Edit hardware · Test Pad')).toBeTruthy();

    for (const name of ['Undo', 'Redo', 'Open from GitHub', 'Print keymap']) {
      expect(screen.getByRole('button', { name })).toHaveProperty('disabled', true);
    }
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    for (const name of ['Open files', 'Reset to demo']) {
      expect(screen.getByRole('menuitem', { name })).toHaveProperty('disabled', true);
    }
    expect(screen.getByRole('menuitem', { name: 'Download .keymap' })).toHaveProperty('disabled', false);
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

  it('arms a pin field on pointer-down, so touch and pen work', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openWizard(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // A touch/pen tap only fires a pointerdown, not a mousedown.
    fireEvent.pointerDown(screen.getByLabelText('Left row 1'), { pointerType: 'touch' });
    expect(screen.getByText(/Picking a pin for Left row 1\./)).toBeTruthy();
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
    await user.click(screen.getByRole('button', { name: 'Change keyboard: Test Pad' }));
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

describe('Wizard layout and navigation', () => {
  const canvas = () => screen.getByRole('group', { name: 'Layout canvas' });
  const rectX = (index: number) => Number(canvasKey(index).querySelector('rect')?.getAttribute('x'));

  async function openLayoutStep(user: ReturnType<typeof userEvent.setup>) {
    await openWizard(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
  }

  it('jumps back to an earlier step from the step list', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openWizard(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(within(screen.getByRole('list', { name: 'Steps' })).getByRole('button', { name: '1. Basics' }));
    expect(screen.getByLabelText('Keyboard name')).toBeTruthy();
    // Later steps can't be jumped to.
    expect(within(screen.getByRole('list', { name: 'Steps' })).queryByRole('button', { name: '3. Layout' })).toBeNull();
  });

  it('gives each half its own pinout when the right half is wired differently', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openWizard(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getAllByRole('figure')).toHaveLength(1);

    await user.click(screen.getByLabelText('The right half is wired differently'));
    const left = screen.getByRole('figure', { name: 'Pro Micro pinout (left half)' });
    const right = screen.getByRole('figure', { name: 'Pro Micro pinout (right half)' });

    await user.click(screen.getByLabelText('Right row 0'));
    // The left pinout doesn't fill a right-half field.
    await user.click(within(left).getByRole('button', { name: 'D4' }));
    expect(screen.getByLabelText('Right row 0')).toHaveProperty('value', '');
    await user.click(within(right).getByRole('button', { name: 'D5' }));
    expect(screen.getByLabelText('Right row 0')).toHaveProperty('value', '5');
    expect(screen.getByLabelText('Left row 0')).toHaveProperty('value', '');
  });

  it('starts the halves four keys apart', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openLayoutStep(user);
    // 3×6 per half: key 6 is the right half's first key, 6 + 4 key widths from the left edge.
    expect(rectX(6) - rectX(0)).toBe(1000);
  });

  it('selects several keys with Ctrl-click, moves and deletes them together, and Esc clears', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openLayoutStep(user);

    await user.click(canvasKey(0));
    await user.keyboard('{Control>}');
    await user.click(canvasKey(1));
    await user.keyboard('{/Control}');
    expect(canvasKey(0).getAttribute('aria-pressed')).toBe('true');
    expect(canvasKey(1).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/2 keys selected/)).toBeTruthy();

    const before = [rectX(0), rectX(1), rectX(2)];
    canvasKey(1).focus();
    await user.keyboard('{ArrowRight}');
    expect([rectX(0), rectX(1), rectX(2)]).toEqual(before.map((x, i) => (i < 2 ? x + 25 : x)));

    await user.keyboard('{Escape}');
    expect(canvasKey(0).getAttribute('aria-pressed')).toBe('false');

    await user.click(canvasKey(0));
    await user.keyboard('{Shift>}');
    await user.click(canvasKey(2));
    await user.keyboard('{/Shift}');
    const count = within(canvas()).getAllByRole('button').length;
    await user.click(screen.getByRole('button', { name: 'Delete 2 keys' }));
    expect(within(canvas()).getAllByRole('button')).toHaveLength(count - 2);
  });

  it('selects the keys inside a box dragged on an empty spot', async () => {
    // jsdom has no SVG geometry: map screen coordinates 1:1 to canvas coordinates.
    const proto = SVGElement.prototype as unknown as Record<string, unknown>;
    proto.getScreenCTM = () => ({ inverse: () => ({}) });
    proto.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform(this: { x: number; y: number }) { return { x: this.x, y: this.y }; } });
    try {
      const user = userEvent.setup();
      render(<App />);
      await openLayoutStep(user);
      fireEvent.pointerDown(canvas(), { clientX: -50, clientY: -50, pointerId: 1 });
      fireEvent.pointerMove(canvas(), { clientX: 150, clientY: 50, pointerId: 1 });
      fireEvent.pointerUp(canvas(), { clientX: 150, clientY: 50, pointerId: 1 });
      expect(screen.getByText(/2 keys selected/)).toBeTruthy();
      expect(canvasKey(0).getAttribute('aria-pressed')).toBe('true');
      expect(canvasKey(1).getAttribute('aria-pressed')).toBe('true');
      expect(canvasKey(2).getAttribute('aria-pressed')).toBe('false');
    } finally {
      delete proto.getScreenCTM;
      delete proto.createSVGPoint;
    }
  });
});

describe('Wizard problem list', () => {
  it('sums up pins that aren’t picked yet in one line', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openWizard(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    // A fresh 3×6 split: 3 rows + 6 columns without a pin.
    expect(screen.getByText('9 pin fields don’t have a pin yet.')).toBeTruthy();
    expect(screen.queryByText('Row 0 on the left half has no pin.')).toBeNull();
  });
});

describe('Pinout seen from the bottom', () => {
  // Pads in screen order: the left column top to bottom, then the right column.
  const padOrder = (figure: HTMLElement) => within(figure).getAllByText(/^(D\d+|GND|RAW|RST|VCC)$/).map((el) => el.textContent);

  it('mirrors the pin columns per half and remembers the choice', async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    await openWizard(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByLabelText('The right half is wired differently'));

    const left = () => screen.getByRole('figure', { name: 'Pro Micro pinout (left half)' });
    const right = () => screen.getByRole('figure', { name: 'Pro Micro pinout (right half)' });
    expect(padOrder(left())[0]).toBe('D1');

    await user.click(within(left()).getByRole('button', { name: 'Bottom' }));
    expect(within(left()).getByRole('button', { name: 'Bottom' }).getAttribute('aria-pressed')).toBe('true');
    // From below, the RAW/GND/RST/VCC column is on the left; USB stays at the top.
    expect(padOrder(left())[0]).toBe('RAW');
    expect(padOrder(right())[0]).toBe('D1');
    expect(within(left()).getByText(/seen from below/)).toBeTruthy();

    // Picking still fills the selected field.
    await user.click(screen.getByLabelText('Left row 0'));
    await user.click(within(left()).getByRole('button', { name: 'D4' }));
    expect(screen.getByLabelText('Left row 0')).toHaveProperty('value', '4');

    // Remembered after the page is opened again.
    view.unmount();
    render(<App />);
    await openWizard(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(padOrder(screen.getByRole('figure', { name: 'Pro Micro pinout (left half)' }))[0]).toBe('RAW');
  });
});

describe('Encoders in the wizard', () => {
  it('adds an encoder, picks its pins, and shows it in the generated shield', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openWizard(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.click(screen.getByRole('button', { name: 'Add encoder' }));
    await user.selectOptions(screen.getByLabelText('Left encoder 0 A'), '8');
    await user.click(screen.getByLabelText('Left encoder 0 B'));
    await user.click(within(screen.getByRole('figure', { name: 'Pro Micro pinout (left half)' })).getByRole('button', { name: 'D9' }));
    expect(screen.getByLabelText('Left encoder 0 B')).toHaveProperty('value', '9');
    expect(screen.getByRole('button', { name: 'D8: Encoder 0 A' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/push button is wired like any other switch/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const dtsi = screen.getByLabelText('config/boards/shields/my_keyboard/my_keyboard.dtsi').textContent ?? '';
    expect(dtsi).toContain('left_encoder_0: encoder_left_0');
    expect(dtsi).toContain('right_encoder_0: encoder_right_0');
  });

  it('removes an encoder', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openWizard(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Add encoder' }));
    await user.click(screen.getByRole('button', { name: 'Remove encoder 0' }));
    expect(screen.queryByLabelText('Left encoder 0 A')).toBeNull();
  });

  it('keeps an encoder’s bindings when another encoder is added later', async () => {
    const hw = { ...testSplit, encoders: [{ a: 8, b: 9 }] };
    const config = newHardwareConfig(hw, 'v0.3');
    config.keymap = { ...config.keymap, layers: config.keymap.layers.map((l) => ({ ...l, sensorBindings: [{ behavior: 'inc_dec_kp', params: ['PG_UP', 'PG_DN'] }, { behavior: 'inc_dec_kp', params: ['C_VOL_UP', 'C_VOL_DN'] }] })) };
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config }));

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Change keyboard: Test Split' }));
    await user.click(screen.getByRole('button', { name: 'Edit hardware' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Add encoder' }));
    await user.selectOptions(screen.getByLabelText('Left encoder 1 A'), '10');
    await user.selectOptions(screen.getByLabelText('Left encoder 1 B'), '16');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Save hardware' }));

    const saved = stored();
    expect(saved.keymap.layers[0].sensorBindings.map((b: { params: string[] }) => b.params.join(' '))).toEqual([
      'PG_UP PG_DN',
      'C_VOL_UP C_VOL_DN',
      'C_VOL_UP C_VOL_DN',
      'C_VOL_UP C_VOL_DN',
    ]);
  });
});

describe('Encoders on keyboards made before encoders existed', () => {
  it('adds an encoder to the right half only, and one on the left doesn’t appear on the right', async () => {
    const hw = { ...testSplit, wiring: { kind: 'matrix', diodeDirection: 'col2row', rows: [4], cols: [6, 7], right: { rows: [4], cols: [7, 6] } } } as KeyboardHardware;
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config: newHardwareConfig(hw, 'v0.3') }));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Change keyboard: Test Split' }));
    await user.click(screen.getByRole('button', { name: 'Edit hardware' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.click(within(screen.getByRole('region', { name: 'Left half' })).getByRole('button', { name: 'Add encoder' }));
    expect(screen.queryByLabelText('Right encoder 0 A')).toBeNull();
    await user.click(within(screen.getByRole('region', { name: 'Left half' })).getByRole('button', { name: 'Remove encoder 0' }));

    await user.click(within(screen.getByRole('region', { name: 'Right half' })).getByRole('button', { name: 'Add encoder' }));
    await user.selectOptions(screen.getByLabelText('Right encoder 0 A'), '8');
    await user.selectOptions(screen.getByLabelText('Right encoder 0 B'), '9');
    expect(screen.queryByLabelText('Left encoder 0 A')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Save hardware' }));

    const saved = stored();
    expect(saved.hardware.rightEncoders).toEqual([{ a: 8, b: 9 }]);
    expect(saved.hardware.encoders ?? []).toEqual([]);
    expect(saved.keymap.layers[0].sensorBindings).toHaveLength(1);
  });
});

describe('Starting over after picking encoder pins', () => {
  it('asks before a size change throws away encoder pins', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    render(<App />);
    await openWizard(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Add encoder' }));
    await user.selectOptions(screen.getByLabelText('Left encoder 0 A'), '8');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await type(user, 'Rows', '4');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(confirm).toHaveBeenCalled();
    expect(screen.getByLabelText('Keyboard name')).toBeTruthy();
  });
});

describe('Displays in the wizard', () => {
  it('adds a nice!view to one half, reserves its pins, and builds that half with the adapter', async () => {
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config: newHardwareConfig(testSplit, 'v0.3') }));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Change keyboard: Test Split' }));
    await user.click(screen.getByRole('button', { name: 'Edit hardware' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.selectOptions(screen.getByLabelText('Left display'), 'nice_view');
    expect(screen.getByRole('button', { name: 'D1: Display CS' })).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Right display'), 'oled_128x32');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('config/boards/shields/test_split/test_split_right.overlay').textContent).toContain('ssd1306@3c');
    await user.click(screen.getByRole('button', { name: 'Save hardware' }));

    const saved = stored();
    expect(saved.hardware.displays).toEqual({ left: 'nice_view', right: 'oled_128x32' });
    expect(saved.build.include.map((t: { shield: string }) => t.shield)).toEqual(['test_split_left nice_view_adapter nice_view', 'test_split_right']);
  });
});

describe('Seeed XIAO in the wizard', () => {
  const xiaoPinout = () => screen.getByRole('figure', { name: /^Seeed XIAO pinout/ });
  const padOrder = (figure: HTMLElement) =>
    within(figure).getAllByText(/^(D\d+|GND|5V|3V3)$/).map((el) => el.textContent);

  async function wiringOnXiao(user: ReturnType<typeof userEvent.setup>) {
    await openWizard(user);
    const controller = screen.getByLabelText('Controller');
    expect(within(controller).getByRole('group', { name: 'Pro Micro footprint' })).toBeTruthy();
    expect(within(within(controller).getByRole('group', { name: 'Seeed XIAO footprint' })).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Seeed Studio XIAO nRF52840',
    ]);
    await user.selectOptions(controller, 'seeeduino_xiao_ble');
    await user.click(screen.getByRole('button', { name: 'Next' }));
  }

  it('shows the XIAO’s 11 pins and its pinout, and assigns a pad by clicking it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await wiringOnXiao(user);
    // "No pin" and D0–D10.
    expect(within(screen.getByLabelText('Left row 0')).getAllByRole('option')).toHaveLength(12);
    expect(padOrder(xiaoPinout())).toEqual(['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', '5V', 'GND', '3V3', 'D10', 'D9', 'D8', 'D7']);
    expect(within(xiaoPinout()).queryByRole('button', { name: '5V' })).toBeNull();
    expect(within(xiaoPinout()).getByText('P1.15')).toBeTruthy();

    await user.click(screen.getByLabelText('Left row 0'));
    await user.click(within(xiaoPinout()).getByRole('button', { name: 'D10' }));
    expect(screen.getByLabelText('Left row 0')).toHaveProperty('value', '10');

    // From below the columns swap sides, USB still at the top.
    await user.click(within(xiaoPinout()).getByRole('button', { name: 'Bottom' }));
    expect(padOrder(xiaoPinout())[0]).toBe('5V');
  });

  it('offers OLEDs on D4/D5 and a nice!view on D9/D10/D8', async () => {
    const user = userEvent.setup();
    render(<App />);
    await wiringOnXiao(user);
    const options = within(screen.getByLabelText('Left display')).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(['', 'nice_view', 'oled_128x32', 'oled_128x64']);
    expect(within(screen.getByLabelText('Left display')).getByRole('option', { name: 'nice!view (D9, D10, D8)' })).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Left display'), 'oled_128x32');
    expect(within(xiaoPinout()).getByRole('button', { name: 'D4: Display SDA' })).toBeTruthy();
  });

  it('keeps pins the XIAO doesn’t have when switching to it, and flags them; a nice!view moves to the XIAO’s pins', async () => {
    const hw: KeyboardHardware = { ...testSplit, wiring: { kind: 'matrix', diodeDirection: 'col2row', rows: [21], cols: [6, 7] }, displays: { left: 'nice_view' } };
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config: newHardwareConfig(hw, 'v0.3') }));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Change keyboard: Test Split' }));
    await user.click(screen.getByRole('button', { name: 'Edit hardware' }));
    await user.selectOptions(screen.getByLabelText('Controller'), 'seeeduino_xiao_ble');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByLabelText('Left row 0')).toHaveProperty('value', '21');
    expect(screen.getByLabelText('Left column 1')).toHaveProperty('value', '7');
    expect(screen.getByText('Row 0 on the left half uses D21, which isn’t a Seeed XIAO pin.')).toBeTruthy();
    expect(screen.getByLabelText('Left display')).toHaveProperty('value', 'nice_view');
    expect(within(xiaoPinout()).getByRole('button', { name: 'D9: Display CS' })).toBeTruthy();
    // Nothing flagged can be saved.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Save hardware' })).toHaveProperty('disabled', true);
  });
});

describe('Display pins in the wizard', () => {
  async function editWiring(user: ReturnType<typeof userEvent.setup>, hw: KeyboardHardware) {
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config: newHardwareConfig(hw, 'v0.3') }));
    render(<App />);
    await user.click(screen.getByRole('button', { name: `Change keyboard: ${hw.displayName}` }));
    await user.click(screen.getByRole('button', { name: 'Edit hardware' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
  }
  const value = (label: string) => (screen.getByLabelText(label) as HTMLSelectElement).value;

  it('moves a nice!view’s pins by select or pinout, and builds it without the adapter', async () => {
    const user = userEvent.setup();
    await editWiring(user, testSplit);
    await user.selectOptions(screen.getByLabelText('Left display'), 'nice_view');
    expect([value('Left display CS'), value('Left display data'), value('Left display clock')]).toEqual(['1', '2', '3']);
    expect(screen.queryByRole('button', { name: 'Use the standard pins for the left display' })).toBeNull();

    await user.click(screen.getByLabelText('Left display CS'));
    await user.click(within(screen.getByRole('figure', { name: /^Pro Micro pinout/ })).getByRole('button', { name: 'D5' }));
    expect(value('Left display CS')).toBe('5');
    expect(screen.getByRole('button', { name: 'D5: Display CS' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Use the standard pins for the left display' }));
    expect(value('Left display CS')).toBe('1');

    await user.selectOptions(screen.getByLabelText('Left display CS'), '5');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Save hardware' }));
    const saved = stored();
    expect(saved.hardware.displayPins).toEqual({ left: { cs: 5 } });
    expect(saved.build.include.map((t: { shield: string }) => t.shield)).toEqual(['test_split_left nice_view', 'test_split_right']);
  });

  it('puts a XIAO nice!view on D9, D10 and D8, and gives an OLED SDA and SCL fields', async () => {
    const user = userEvent.setup();
    await editWiring(user, { ...testSplit, controller: 'seeeduino_xiao_ble', wiring: { kind: 'matrix', diodeDirection: 'col2row', rows: [0], cols: [1, 2] } });
    await user.selectOptions(screen.getByLabelText('Left display'), 'nice_view');
    expect([value('Left display CS'), value('Left display data'), value('Left display clock')]).toEqual(['9', '10', '8']);
    await user.selectOptions(screen.getByLabelText('Right display'), 'oled_128x32');
    expect([value('Right display SDA'), value('Right display SCL')]).toEqual(['4', '5']);
  });
});

describe('Pinout colours', () => {
  it('marks each pad with what it is used for, and a pin used twice', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openWizard(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.selectOptions(screen.getByLabelText('Left row 0'), '4');
    await user.selectOptions(screen.getByLabelText('Left column 0'), '6');
    await user.click(screen.getByRole('button', { name: 'Add encoder' }));
    await user.selectOptions(screen.getByLabelText('Left encoder 0 A'), '8');
    expect(screen.getByRole('button', { name: 'D4: Row 0' }).className).toContain('use-row');
    expect(screen.getByRole('button', { name: 'D6: Column 0' }).className).toContain('use-col');
    expect(screen.getByRole('button', { name: 'D8: Encoder 0 A' }).className).toContain('use-encoder');
    expect(screen.getByRole('button', { name: 'D9' }).className).toContain('use-free');
    await user.selectOptions(screen.getByLabelText('Left column 1'), '4');
    expect(screen.getByRole('button', { name: 'D4: Row 0, Column 1' }).className).toContain('use-clash');
  });
});
