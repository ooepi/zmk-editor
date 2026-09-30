import { describe, expect, it } from 'vitest';
import { placeEncoders, splitHalves } from './encoders.ts';
import { layoutExtent, type PhysicalKey, type PhysicalLayout } from './types.ts';

const key = (x: number, y: number, extra: Partial<PhysicalKey & { side: 'left' | 'right' }> = {}) => ({ x, y, w: 100, h: 100, r: 0, rx: 0, ry: 0, ...extra });
/** Two 2×2 halves with a 2u gap: left keys 0–3 at x 0–199, right keys 4–7 at x 400–599; bottom at y 200. */
const split: PhysicalLayout = {
  name: 'split',
  keys: [key(0, 0), key(100, 0), key(0, 100), key(100, 100), key(400, 0), key(500, 0), key(400, 100), key(500, 100)],
};
const unibody: PhysicalLayout = { name: 'one', keys: [0, 100, 200, 300].map((x) => key(x, 0)) };

describe('splitHalves', () => {
  it('splits at the widest gap, or by the keys’ own side', () => {
    expect(splitHalves(split.keys)).toEqual({ left: [0, 1, 2, 3], right: [4, 5, 6, 7] });
    const sided = split.keys.map((k, i) => ({ ...k, side: i % 2 === 0 ? ('left' as const) : ('right' as const) }));
    expect(splitHalves(sided).left).toEqual([0, 2, 4, 6]);
  });
});

describe('placeEncoders', () => {
  it('puts each half’s encoders centred under that half', () => {
    expect(placeEncoders(split, ['left', 'right'], 2)).toEqual([
      { x: 100, y: 275 },
      { x: 500, y: 275 },
    ]);
  });

  it('spaces several encoders on one half side by side', () => {
    expect(placeEncoders(split, ['left', 'left'], 2)).toEqual([
      { x: 37.5, y: 275 },
      { x: 162.5, y: 275 },
    ]);
  });

  it('centres encoders of a one-piece keyboard, or of an unknown half, under all keys', () => {
    expect(placeEncoders(unibody, [], 1)).toEqual([{ x: 200, y: 175 }]);
    expect(placeEncoders(split, [undefined], 1)).toEqual([{ x: 300, y: 275 }]);
  });

  it('keeps saved positions', () => {
    const saved = { ...split, encoders: [null, { x: 900, y: 50 }] };
    expect(placeEncoders(saved, ['left', 'right'], 2)).toEqual([
      { x: 100, y: 275 },
      { x: 900, y: 50 },
    ]);
  });
});

describe('layoutExtent with encoders', () => {
  it('makes room for knobs outside the keys', () => {
    expect(layoutExtent({ ...split, encoders: [{ x: 100, y: 275 }] }).height).toBe(325);
  });
});
