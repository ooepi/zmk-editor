import { describe, expect, it } from 'vitest';
import { formatBinding } from '../keymap/bindings.ts';
import { createCombo } from '../keymap/comboEdit.ts';
import { generateKeymap } from '../keymap/generator.ts';
import { importKeymap } from '../keymap/importer.ts';
import { DEFAULT_BASICS, gridHardware } from './grid.ts';
import { addKey, deleteKey, deleteKeys, remapKeyPositions } from './keys.ts';
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
