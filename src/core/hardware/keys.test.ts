import { describe, expect, it } from 'vitest';
import { formatBinding } from '../keymap/bindings.ts';
import { createCombo } from '../keymap/comboEdit.ts';
import { generateKeymap } from '../keymap/generator.ts';
import { importKeymap } from '../keymap/importer.ts';
import { DEFAULT_BASICS, gridHardware } from './grid.ts';
import { addKey, deleteKey, deleteKeys, numberFromPositions, remapKeyPositions, remapSensors } from './keys.ts';
import type { HardwareKey, KeyboardHardware } from './types.ts';
import { starterKeymap } from './starter.ts';

const pad = { ...gridHardware({ ...DEFAULT_BASICS, name: 'test_pad', displayName: 'Test Pad', split: false, rows: 1, cols: 3 }) };

describe('starterKeymap', () => {
  it('fills keys with letters in order and round-trips through the keymap generator', () => {
    const keymap = starterKeymap(pad);
    expect(keymap.layers[0]?.bindings.map(formatBinding)).toEqual(['&kp Q', '&kp W', '&kp E']);
    expect(importKeymap(generateKeymap(keymap)).model).toEqual(keymap);
  });
});

describe('remapKeyPositions', () => {
  it('drops deleted keys, adds &trans for new ones and moves combos', () => {
    let keymap = starterKeymap(pad);
    keymap = { ...keymap, combos: [createCombo(keymap, [0, 1]), { ...createCombo(keymap, [0, 2]), name: 'combo_2' }] };
    const { model, notes } = remapKeyPositions(keymap, [0, 2, undefined]);
    expect(model.layers[0]?.bindings.map(formatBinding)).toEqual(['&kp Q', '&kp E', '&trans']);
    expect(model.combos.map((c) => [c.name, c.keyPositions])).toEqual([['combo_2', ['0', '1']]]);
    expect(notes).toEqual(['Removed combo combo_1: its keys were deleted.']);
  });

  it('keeps #define key positions and notes a combo that lost a key', () => {
    const keymap = { ...starterKeymap(pad), combos: [{ ...createCombo(starterKeymap(pad), [0, 1, 2]), keyPositions: ['0', '1', '2', 'EXTRA'] }] };
    const { model, notes } = remapKeyPositions(keymap, [0, 2]);
    expect(model.combos[0]?.keyPositions).toEqual(['0', '1', 'EXTRA']);
    expect(notes).toEqual(['Combo combo_1 lost a deleted key.']);
  });
});

describe('addKey / deleteKey', () => {
  it('adds a matrix key on the first free position of that half, next to its last key', () => {
    const split = gridHardware({ ...DEFAULT_BASICS, rows: 1, cols: 2 });
    const without = deleteKey(split, 2); // the right half's first key (row 0, column 0)
    const next = addKey(without, 'right');
    expect(next.keys.at(-1)).toMatchObject({ row: 0, col: 0, side: 'right', x: 800, y: 0 });
  });

  it('adds a direct input for a new direct-wired key', () => {
    const direct = gridHardware({ ...DEFAULT_BASICS, split: false, wiring: 'direct', rows: 1, cols: 2 });
    const next = addKey(direct);
    expect(next.wiring).toEqual({ kind: 'direct', pins: [null, null, null] });
    expect(next.keys.at(-1)).toMatchObject({ row: 0, col: 2, x: 200 });
  });
});

describe('deleteKeys', () => {
  it('removes several keys at once', () => {
    const hw = gridHardware({ ...DEFAULT_BASICS, split: false, rows: 1, cols: 4 });
    expect(deleteKeys(hw, [0, 2]).keys.map((k) => k.col)).toEqual([1, 3]);
  });
});

describe('remapSensors', () => {
  const volume = { behavior: 'inc_dec_kp', params: ['C_VOL_UP', 'C_VOL_DN'] };
  const pages = { behavior: 'inc_dec_kp', params: ['PG_UP', 'PG_DN'] };
  const model = { ...starterKeymap(pad), layers: [{ name: 'default_layer', bindings: [], properties: [], sensorBindings: [pages] }, { name: 'nav', bindings: [], properties: [] }] };

  it('keeps bindings of kept encoders, gives new ones volume on the base layer, and leaves other layers falling through', () => {
    const next = remapSensors(model, [undefined, 0]);
    expect(next.layers[0]?.sensorBindings).toEqual([volume, pages]);
    // ZMK can't list &trans in sensor-bindings; a layer without them falls through.
    expect(next.layers[1]?.sensorBindings).toBeUndefined();
    const withNav = { ...model, layers: model.layers.map((l, i) => (i === 1 ? { ...l, sensorBindings: [pages] } : l)) };
    // A new encoder on a layer with its own bindings falls through there (a trailing entry is left out).
    expect(remapSensors(withNav, [0, undefined]).layers[1]?.sensorBindings).toEqual([pages]);
  });

  it('removes sensor bindings when there are no encoders left', () => {
    expect(remapSensors(model, []).layers[0]).not.toHaveProperty('sensorBindings');
  });
});

describe('numberFromPositions', () => {
  const coords = (hw: KeyboardHardware) => hw.keys.map((k) => `${k.row},${k.col}`);
  const key = (x: number, y: number, extra: Partial<HardwareKey> = {}): HardwareKey => ({ x, y, w: 100, h: 100, r: 0, rx: 0, ry: 0, row: 0, col: 0, ...extra });

  it('numbers a grid back the way the wizard made it, per half', () => {
    const grid = gridHardware({ ...DEFAULT_BASICS, rows: 3, cols: 6 });
    const scrambled = { ...grid, keys: grid.keys.map((k) => ({ ...k, row: 0, col: 0 })) };
    expect(coords(numberFromPositions(scrambled))).toEqual(coords(grid));
  });

  it('follows column stagger, and puts thumb keys on a row of their own', () => {
    const stagger = [0, -25, -40, -25, 0];
    const keys = [
      ...[0, 1, 2].flatMap((row) => stagger.map((dy, col) => key(col * 100, row * 100 + dy))),
      key(150, 330),
      key(250, 340),
      key(350, 330),
    ];
    const hw: KeyboardHardware = { ...gridHardware({ ...DEFAULT_BASICS, split: false, rows: 4, cols: 5 }), keys };
    expect(coords(numberFromPositions(hw))).toEqual([
      '0,0', '0,1', '0,2', '0,3', '0,4',
      '1,0', '1,1', '1,2', '1,3', '1,4',
      '2,0', '2,1', '2,2', '2,3', '2,4',
      '3,0', '3,1', '3,2',
    ]);
  });

  it('uses where a rotated key really is', () => {
    const keys = [key(0, 0), key(100, 0), key(0, 300, { r: 90, rx: 0, ry: 300 })];
    // Turned 90° about its top-left corner, the last key sits left of x = 0, still below the others.
    const hw: KeyboardHardware = { ...gridHardware({ ...DEFAULT_BASICS, split: false, rows: 2, cols: 2 }), keys };
    expect(coords(numberFromPositions(hw))).toEqual(['0,0', '0,1', '1,0']);
  });

  it('gives direct-wired keys inputs in reading order, mirrored on a mirrored right half', () => {
    const direct = gridHardware({ ...DEFAULT_BASICS, wiring: 'direct', rows: 2, cols: 2 });
    const scrambled = { ...direct, keys: direct.keys.map((k) => ({ ...k, row: 0, col: 0 })) };
    expect(coords(numberFromPositions(scrambled))).toEqual(coords(direct));
  });
});
