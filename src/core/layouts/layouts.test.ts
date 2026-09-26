import { describe, expect, it } from 'vitest';
import { getPhysicalLayout, layoutBounds } from './index.ts';

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
