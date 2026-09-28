import { describe, expect, it } from 'vitest';
import { keysInBox, moveKeys } from './selection.ts';
import type { PhysicalKey } from './types.ts';

const key = (x: number, y: number, extra: Partial<PhysicalKey> = {}): PhysicalKey => ({ x, y, w: 100, h: 100, r: 0, rx: 0, ry: 0, ...extra });

describe('keysInBox', () => {
  const keys = [key(0, 0), key(100, 0), key(300, 0), key(0, 200)];

  it('finds keys that overlap the box, whichever corner it was dragged from', () => {
    expect(keysInBox(keys, { x1: 50, y1: 50, x2: 150, y2: 90 })).toEqual([0, 1]);
    expect(keysInBox(keys, { x1: 150, y1: 90, x2: 50, y2: 50 })).toEqual([0, 1]);
    expect(keysInBox(keys, { x1: 210, y1: 0, x2: 290, y2: 300 })).toEqual([]);
  });

  it('uses the rotated outline of a rotated key', () => {
    // A key rotated 45° around its centre pokes out about 21 units past its unrotated edge.
    const rotated = [key(0, 0, { r: 45, rx: 50, ry: 50 })];
    expect(keysInBox(rotated, { x1: 105, y1: 40, x2: 200, y2: 60 })).toEqual([0]);
    expect(keysInBox([key(0, 0)], { x1: 105, y1: 40, x2: 200, y2: 60 })).toEqual([]);
  });
});

describe('moveKeys', () => {
  it('moves only the given keys, and a rotated key’s origin moves with it', () => {
    const keys = [key(0, 0), key(100, 0, { r: 15, rx: 150, ry: 50 }), key(200, 0)];
    const moved = moveKeys(keys, [0, 1], 25, -25);
    expect(moved[0]).toMatchObject({ x: 25, y: -25 });
    expect(moved[1]).toMatchObject({ x: 125, y: -25, rx: 175, ry: 25 });
    expect(moved[2]).toBe(keys[2]);
  });
});
