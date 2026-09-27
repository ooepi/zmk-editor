import { describe, expect, it } from 'vitest';
import type { KeyboardHardware } from './types.ts';
import {
  directInputUsed,
  halfSize,
  matrixPins,
  pinUses,
  removeDirectPin,
  resizeMatrix,
  setPin,
  setRightWiredDifferently,
} from './wiring.ts';

const key = (row: number, col: number, side?: 'left' | 'right') => ({ x: 0, y: 0, w: 100, h: 100, r: 0, rx: 0, ry: 0, row, col, ...(side ? { side } : {}) });

const split: KeyboardHardware = {
  name: 'test_split',
  displayName: 'Test Split',
  controller: 'nice_nano_v2',
  split: true,
  wiring: { kind: 'matrix', diodeDirection: 'col2row', rows: [4], cols: [6, 7, 8] },
  keys: [key(0, 0, 'left'), key(0, 1, 'left'), key(0, 2, 'left'), key(0, 0, 'right'), key(0, 1, 'right'), key(0, 2, 'right')],
};

describe('wiring helpers', () => {
  it('mirrors the right half: same rows, columns reversed', () => {
    if (split.wiring.kind !== 'matrix') throw new Error('matrix expected');
    expect(matrixPins(split.wiring, 'left')).toEqual({ rows: [4], cols: [6, 7, 8] });
    expect(matrixPins(split.wiring, 'right')).toEqual({ rows: [4], cols: [8, 7, 6] });
    expect(halfSize(split, 'right')).toEqual({ rows: 1, cols: 3 });
  });

  it('makes the right half explicit when one of its pins is set', () => {
    const next = setPin(split, 'right', 'cols', 0, 9);
    expect(next.wiring).toMatchObject({ cols: [6, 7, 8], right: { rows: [4], cols: [9, 7, 6] } });
    expect(setPin(split, 'left', 'rows', 0, 5).wiring).toMatchObject({ rows: [5] });
  });

  it('turns the separate right-half table on from the mirrored pins, and off again', () => {
    const on = setRightWiredDifferently(split, true);
    expect(on.wiring).toMatchObject({ right: { rows: [4], cols: [8, 7, 6] } });
    expect(setRightWiredDifferently(on, false).wiring).not.toHaveProperty('right');
  });

  it('resizes a matrix and keeps mirrored right-half keys on their pins', () => {
    const bigger = resizeMatrix(split, 2, 4);
    expect(bigger.wiring).toMatchObject({ rows: [4, null], cols: [6, 7, 8, null] });
    // The new column is on the inner edge; right keys shift so they keep their mirrored pins.
    expect(bigger.keys.filter((k) => k.side === 'right').map((k) => k.col)).toEqual([1, 2, 3]);
    if (bigger.wiring.kind !== 'matrix') throw new Error('matrix expected');
    expect(matrixPins(bigger.wiring, 'right').cols[3]).toBe(6);
  });

  it('lists what each pin does', () => {
    expect([...pinUses(split, 'left')]).toEqual([[4, ['Row 0']], [6, ['Column 0']], [7, ['Column 1']], [8, ['Column 2']]]);
  });

  it('removes an unused direct input and renumbers the keys after it', () => {
    const pad: KeyboardHardware = {
      ...split,
      split: false,
      wiring: { kind: 'direct', pins: [4, 5, 6] },
      keys: [key(0, 0), key(0, 2)],
    };
    expect(directInputUsed(pad, undefined, 1)).toBe(false);
    const next = removeDirectPin(pad, undefined, 1);
    expect(next.wiring).toEqual({ kind: 'direct', pins: [4, 6] });
    expect(next.keys.map((k) => k.col)).toEqual([0, 1]);
  });
});
