import { describe, expect, it } from 'vitest';
import { getPhysicalLayout, layoutBounds, layoutExtent } from './index.ts';

describe('lily58 physical layout', () => {
  const layout = getPhysicalLayout('lily58');

  it('has 58 keys with the rotated thumb keys', () => {
    expect(layout?.keys).toHaveLength(58);
    expect(layout?.keys[53]).toEqual({ x: 575, y: 400, w: 100, h: 150, r: 30, rx: 625, ry: 475 });
    expect(layout?.keys[54]?.r).toBe(-30);
  });

  it('has bounds covering every key', () => {
    if (!layout) throw new Error('missing layout');
    expect(layoutBounds(layout)).toEqual({ width: 1650, height: 550 });
  });
});

describe('layoutExtent', () => {
  const key = (x: number, y: number, r = 0) => ({ x, y, w: 100, h: 100, r, rx: x + 50, ry: y + 50 });

  it('covers keys left of and above 0', () => {
    expect(layoutExtent({ name: 't', keys: [key(-40, -10), key(200, 100)] })).toEqual({ left: -40, top: -10, width: 340, height: 210 });
  });

  it('includes the corners of rotated keys', () => {
    const extent = layoutExtent({ name: 't', keys: [key(0, 0, 45)] });
    expect(extent.left).toBeCloseTo(50 - 50 * Math.SQRT2);
    expect(extent.width).toBeCloseTo(100 * Math.SQRT2);
  });
});
