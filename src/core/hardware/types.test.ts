import { describe, expect, it } from 'vitest';
import type { KeyboardHardware } from './types.ts';
import { hardwareLayout } from './types.ts';

describe('hardwareLayout', () => {
  it('returns name = displayName and only layout properties from keys', () => {
    const hw: KeyboardHardware = {
      name: 'test_kb',
      displayName: 'Test Keyboard',
      controller: 'nice_nano_v2',
      split: false,
      wiring: { kind: 'direct', pins: [4, 5] },
      keys: [
        { x: 10, y: 20, w: 100, h: 100, r: 0, rx: 50, ry: 50, row: 0, col: 0 },
        { x: 110, y: 20, w: 100, h: 100, r: 0, rx: 50, ry: 50, row: 0, col: 1, side: 'left' },
      ],
    };

    const layout = hardwareLayout(hw);

    expect(layout.name).toBe('Test Keyboard');
    expect(layout.keys).toHaveLength(2);
    const key0 = layout.keys[0];
    const key1 = layout.keys[1];
    expect(key0).toEqual({ x: 10, y: 20, w: 100, h: 100, r: 0, rx: 50, ry: 50 });
    expect(key1).toEqual({ x: 110, y: 20, w: 100, h: 100, r: 0, rx: 50, ry: 50 });
    // Verify no row, col, or side properties
    if (key0) expect('row' in key0).toBe(false);
    if (key0) expect('col' in key0).toBe(false);
    if (key0) expect('side' in key0).toBe(false);
  });
});
