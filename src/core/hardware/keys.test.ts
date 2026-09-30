import { describe, expect, it } from 'vitest';
import { formatBinding } from '../keymap/bindings.ts';
import { createCombo } from '../keymap/comboEdit.ts';
import { generateKeymap } from '../keymap/generator.ts';
import { importKeymap } from '../keymap/importer.ts';
import { DEFAULT_BASICS, gridHardware } from './grid.ts';
import { addKey, deleteKey, deleteKeys, numberFromPositions, remapKeyPositions, remapSensors } from './keys.ts';
import type { HardwareKey, KeyboardHardware, MatrixWiring } from './types.ts';
import { matrixPins } from './wiring.ts';
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
  const oneHalf = (keys: HardwareKey[], rows: number, cols: number): KeyboardHardware => ({
    ...gridHardware({ ...DEFAULT_BASICS, split: false, rows, cols }),
    keys,
  });

  it('numbers a grid back the way the wizard made it, per half', () => {
    const grid = gridHardware({ ...DEFAULT_BASICS, rows: 3, cols: 6 });
    const scrambled = { ...grid, keys: grid.keys.map((k) => ({ ...k, row: 0, col: 0 })) };
    expect(coords(numberFromPositions(scrambled))).toEqual(coords(grid));
  });

  it('follows column stagger of any size, and puts thumb keys on the next row of their column', () => {
    // Kyria-like: columns up to ¾ of a key apart.
    const stagger = [75, 75, 25, 0, 12, 25];
    const keys = [...[0, 1, 2].flatMap((row) => stagger.map((dy, col) => key(col * 100, row * 100 + dy))), key(300, 330), key(420, 345), key(530, 330)];
    expect(coords(numberFromPositions(oneHalf(keys, 4, 6)))).toEqual([
      '0,0', '0,1', '0,2', '0,3', '0,4', '0,5',
      '1,0', '1,1', '1,2', '1,3', '1,4', '1,5',
      '2,0', '2,1', '2,2', '2,3', '2,4', '2,5',
      '3,3', '3,4', '3,5',
    ]);
  });

  it('puts a rotated thumb key in the row under the nearest column', () => {
    // Turned 30° about its own corner, the thumb still sits under column 2, a key below the bottom row.
    const keys = [...[0, 1, 2].flatMap((row) => [0, 1, 2].map((col) => key(col * 100, row * 100))), key(200, 320, { r: 30, rx: 200, ry: 320 })];
    expect(coords(numberFromPositions(oneHalf(keys, 4, 3))).at(-1)).toBe('3,2');
  });

  it('keeps a mirrored right half’s short rows on the same pins as the left’s', () => {
    // 3 × 6 per half with three inner thumb keys; the right half mirrors the left, columns reversed.
    const grid = gridHardware({ ...DEFAULT_BASICS, rows: 4, cols: 6 });
    const withThumbs: KeyboardHardware = {
      ...grid,
      keys: [
        ...grid.keys.filter((k) => k.y < 300),
        ...[3, 4, 5].map((c) => key(c * 100, 300, { side: 'left' })),
        ...[0, 1, 2].map((c) => key(1000 + c * 100, 300, { side: 'right' })),
      ],
      wiring: { kind: 'matrix', diodeDirection: 'col2row', rows: [1, 2, 3, 4], cols: [5, 6, 7, 8, 9, 10] },
    };
    const numbered = numberFromPositions(withThumbs);
    const pinOf = (k: HardwareKey) => matrixPins(numbered.wiring as MatrixWiring, k.side).cols[k.col];
    const thumbs = numbered.keys.slice(-6);
    // The innermost thumb of each half (left: x = 500, right: x = 1000) is on the same column pin, and so on outwards.
    expect(thumbs.slice(0, 3).map(pinOf).reverse()).toEqual(thumbs.slice(3).map(pinOf));
    expect(thumbs.map((k) => k.row)).toEqual([3, 3, 3, 3, 3, 3]);
  });

  it('numbers a row-staggered board by rows instead', () => {
    // A 1u-wide keyboard with the second row a quarter key along: its "columns" would hold two keys side by side.
    const keys = [...[0, 1, 2, 3].map((c) => key(c * 100, 0)), ...[0, 1, 2].map((c) => key(25 + c * 100, 100)), key(50, 200, { w: 250 })];
    expect(coords(numberFromPositions(oneHalf(keys, 3, 4)))).toEqual(['0,0', '0,1', '0,2', '0,3', '1,0', '1,1', '1,2', '2,0']);
  });

  it('gives direct-wired keys inputs in reading order, mirrored on a mirrored right half', () => {
    const direct = gridHardware({ ...DEFAULT_BASICS, wiring: 'direct', rows: 2, cols: 2 });
    const scrambled = { ...direct, keys: direct.keys.map((k) => ({ ...k, row: 0, col: 0 })) };
    expect(coords(numberFromPositions(scrambled))).toEqual(coords(direct));
  });

  it('counts keys without a half on a split as the left half’s', () => {
    const grid = gridHardware({ ...DEFAULT_BASICS, rows: 1, cols: 2 });
    const loose = { ...grid, keys: grid.keys.map((k, i) => (i === 0 ? { ...k, side: undefined, col: 5 } : k)) };
    expect(numberFromPositions(loose).keys[0]?.col).toBe(0);
  });
});
