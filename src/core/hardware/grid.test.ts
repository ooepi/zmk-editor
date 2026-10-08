import { describe, expect, it } from 'vitest';
import { basicsOf, DEFAULT_BASICS, gridHardware, hardwareName } from './grid.ts';
import { testShiftPad } from './testFixtures.ts';
import { matrixPins } from './wiring.ts';

describe('gridHardware', () => {
  it('derives an id from the display name', () => {
    expect(hardwareName('My Split 2!')).toBe('my_split_2');
    expect(hardwareName('42 keys')).toBe('kb_42_keys');
    expect(hardwareName('!!!')).toBe('my_keyboard');
  });

  it('lays out a unibody matrix row by row, one position per key, no pins yet', () => {
    const hw = gridHardware({ ...DEFAULT_BASICS, split: false, rows: 2, cols: 2 });
    expect(hw.keys.map((k) => [k.x, k.y, k.row, k.col, k.side])).toEqual([
      [0, 0, 0, 0, undefined],
      [100, 0, 0, 1, undefined],
      [0, 100, 1, 0, undefined],
      [100, 100, 1, 1, undefined],
    ]);
    expect(hw.wiring).toEqual({ kind: 'matrix', diodeDirection: 'col2row', rows: [null, null], cols: [null, null] });
  });

  it('puts the right half four keys to the right; its outer column shares the left outer column pin', () => {
    const hw = gridHardware({ ...DEFAULT_BASICS, rows: 1, cols: 3 });
    expect(hw.keys.map((k) => [k.x, k.col, k.side])).toEqual([
      [0, 0, 'left'], [100, 1, 'left'], [200, 2, 'left'],
      [700, 0, 'right'], [800, 1, 'right'], [900, 2, 'right'],
    ]);
    const wired = { ...hw, wiring: { kind: 'matrix' as const, diodeDirection: 'col2row' as const, rows: [4], cols: [6, 7, 8] } };
    // Left outer = column 0 (x 0); right outer = column 2 (x 900): both use D6.
    expect(matrixPins(wired.wiring, 'right').cols[2]).toBe(6);
  });

  it('gives direct-wired keys one input each, mirrored on the right half', () => {
    const hw = gridHardware({ ...DEFAULT_BASICS, wiring: 'direct', rows: 1, cols: 3 });
    expect(hw.keys.map((k) => [k.row, k.col])).toEqual([[0, 0], [0, 1], [0, 2], [0, 2], [0, 1], [0, 0]]);
    expect(hw.wiring).toEqual({ kind: 'direct', pins: [null, null, null] });
  });

  it('reads the basics back from a keyboard', () => {
    const basics = { ...DEFAULT_BASICS, rows: 4, cols: 5 };
    expect(basicsOf(gridHardware(basics))).toEqual(basics);
  });

  it('reports direct wiring as one row of inputs, even with a staggered key', () => {
    const hw = gridHardware({ ...DEFAULT_BASICS, wiring: 'direct', split: false, rows: 3, cols: 6 });
    const staggered = { ...hw, keys: hw.keys.map((k, i) => (i === 0 ? { ...k, y: k.y + 25 } : k)) };
    expect(basicsOf(staggered)).toEqual({ ...DEFAULT_BASICS, wiring: 'direct', split: false, rows: 1, cols: 18 });
  });
});

describe('basicsOf with shift registers', () => {
  it('reports the shift register count of an existing keyboard', () => {
    expect(basicsOf(testShiftPad).shiftRegisters).toBe(1);
    expect(DEFAULT_BASICS.shiftRegisters).toBe(0);
  });
});
