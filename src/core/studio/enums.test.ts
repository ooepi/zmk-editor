import { describe, expect, it } from 'vitest';
import { decodeEnum, enumCells, enumCellCount } from './enums.ts';

describe('enumCells', () => {
  it('gives the cells a token stands for, from the ZMK headers', () => {
    expect(enumCells('bt', 'BT_SEL')).toEqual([3]);
    expect(enumCells('bt', 'BT_CLR')).toEqual([0, 0]);
    expect(enumCells('out', 'OUT_BLE')).toEqual([2]);
    expect(enumCells('rgb_ug', 'RGB_BRI')).toEqual([7, 0]);
    expect(enumCells('bl', 'BL_TOG')).toEqual([2, 0]);
    expect(enumCells('ext_power', 'EP_TOG')).toEqual([2]);
    expect(enumCells('mkp', 'MB2')).toEqual([2]);
    expect(enumCells('mkp', 'LCLK')).toEqual([1]);
    expect(enumCells('mmv', 'MOVE_LEFT')).toEqual([0xfda80000]);
    expect(enumCells('mmv', 'MOVE_DOWN')).toEqual([600]);
    expect(enumCells('msc', 'SCRL_DOWN')).toEqual([0xfff6]);
  });

  it('is undefined for unknown tokens or behaviors', () => {
    expect(enumCells('bt', 'NOPE')).toBeUndefined();
    expect(enumCells('kp', 'A')).toBeUndefined();
  });
});

describe('decodeEnum', () => {
  it('turns cells back into the tokens the editor writes', () => {
    expect(decodeEnum('bt', [3, 1])).toEqual(['BT_SEL', '1']);
    expect(decodeEnum('bt', [0, 0])).toEqual(['BT_CLR']);
    expect(decodeEnum('rgb_ug', [0, 0])).toEqual(['RGB_TOG']);
    expect(decodeEnum('mkp', [4, 0])).toEqual(['MB3']);
    expect(decodeEnum('mmv', [0xfda80000, 0])).toEqual(['MOVE_LEFT']);
    expect(decodeEnum('out', [0, 0])).toEqual(['OUT_TOG']);
  });

  it('is undefined when nothing matches', () => {
    expect(decodeEnum('bt', [9, 0])).toBeUndefined();
    expect(decodeEnum('kp', [4, 0])).toBeUndefined();
  });

  it('knows how many cells each enum behavior takes', () => {
    expect(enumCellCount('bt')).toBe(2);
    expect(enumCellCount('mkp')).toBe(1);
    expect(enumCellCount('kp')).toBeUndefined();
  });
});
