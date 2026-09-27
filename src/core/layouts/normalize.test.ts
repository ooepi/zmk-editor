import { describe, expect, it } from 'vitest';
import { normalizedLayout } from './normalize.ts';
import type { PhysicalLayout } from './types.ts';

describe('normalizedLayout', () => {
  it('leaves an already non-negative integer layout untouched', () => {
    const layout: PhysicalLayout = { name: 'x', keys: [{ x: 0, y: 0, w: 100, h: 100, r: 0, rx: 0, ry: 0 }] };
    expect(normalizedLayout(layout)).toEqual(layout);
  });

  it('shifts keys so the minimum x and y are 0, shifting rx/ry along with them', () => {
    const layout: PhysicalLayout = {
      name: 'x',
      keys: [
        { x: -25, y: 0, w: 100, h: 100, r: 0, rx: 0, ry: 0 },
        { x: 75, y: -10, w: 100, h: 100, r: 15, rx: 137, ry: 40 },
      ],
    };
    const result = normalizedLayout(layout);
    expect(result.keys[0]).toEqual({ x: 0, y: 10, w: 100, h: 100, r: 0, rx: 0, ry: 0 });
    expect(result.keys[1]).toEqual({ x: 100, y: 0, w: 100, h: 100, r: 15, rx: 162, ry: 50 });
  });

  it('does not shift rx/ry for keys with no rotation', () => {
    const layout: PhysicalLayout = {
      name: 'x',
      keys: [{ x: -25, y: 0, w: 100, h: 100, r: 0, rx: 999, ry: 999 }],
    };
    const result = normalizedLayout(layout);
    // rx/ry are irrelevant when r === 0, but the rule only shifts keys with r !== 0.
    expect(result.keys[0]).toEqual({ x: 0, y: 0, w: 100, h: 100, r: 0, rx: 999, ry: 999 });
  });

  it('rounds every cell to an integer', () => {
    const layout: PhysicalLayout = {
      name: 'x',
      keys: [{ x: 0, y: 0, w: 62.5, h: 100, r: 15, rx: 62.5, ry: 50 }],
    };
    const result = normalizedLayout(layout);
    expect(result.keys[0]).toEqual({ x: 0, y: 0, w: 63, h: 100, r: 15, rx: 63, ry: 50 });
  });

  it('shifts by the minimum of x and y independently, ignoring rotation for the bound', () => {
    const layout: PhysicalLayout = {
      name: 'x',
      keys: [
        { x: 0, y: 0, w: 100, h: 100, r: 0, rx: 0, ry: 0 },
        { x: -50, y: -30, w: 100, h: 100, r: 0, rx: 0, ry: 0 },
      ],
    };
    const result = normalizedLayout(layout);
    expect(result.keys[0]).toEqual({ x: 50, y: 30, w: 100, h: 100, r: 0, rx: 0, ry: 0 });
    expect(result.keys[1]).toEqual({ x: 0, y: 0, w: 100, h: 100, r: 0, rx: 0, ry: 0 });
  });
});
