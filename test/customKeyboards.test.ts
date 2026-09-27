import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateConfig, importConfig } from '../src/core/config.ts';
import { newHardwareConfig } from '../src/core/hardware/config.ts';
import { DEFAULT_BASICS, gridHardware } from '../src/core/hardware/grid.ts';
import type { KeyboardHardware } from '../src/core/hardware/types.ts';
import { validateHardware } from '../src/core/hardware/validate.ts';

/** A 3×6+3 split (Corne-like), COL2ROW, right half mirrored; the Corne's pins. */
const split: KeyboardHardware = (() => {
  const hw = gridHardware({ ...DEFAULT_BASICS, name: 'editor_split', displayName: 'Editor Split', rows: 4, cols: 6 });
  return {
    ...hw,
    wiring: { kind: 'matrix', diodeDirection: 'col2row', rows: [4, 5, 6, 7], cols: [21, 20, 19, 18, 15, 14] },
    // Row 3 keeps the three inner thumb keys per half.
    keys: hw.keys.filter((k) => k.row !== 3 || (k.side === 'left' ? k.col >= 3 : k.col <= 2)),
  };
})();

/** A 5×4 numpad, ROW2COL, one piece. */
const numpad: KeyboardHardware = {
  ...gridHardware({ ...DEFAULT_BASICS, name: 'editor_numpad', displayName: 'Editor Numpad', controller: 'puchi_ble_v1', split: false, rows: 5, cols: 4, diodeDirection: 'row2col' }),
  wiring: { kind: 'matrix', diodeDirection: 'row2col', rows: [2, 3, 4, 5, 6], cols: [7, 8, 9, 10] },
};

/** A 2×3 direct-wired split whose right half has its own pins. */
const duo: KeyboardHardware = {
  ...gridHardware({ ...DEFAULT_BASICS, name: 'editor_duo', displayName: 'Editor Duo', controller: 'bluemicro840_v1', wiring: 'direct', rows: 2, cols: 3 }),
  wiring: { kind: 'direct', pins: [2, 3, 4, 5, 6, 7], right: [21, 20, 19, 18, 15, 14] },
};

// Built with ZMK in CI (.github/workflows/firmware.yml). Update with `npx vitest run -u`.
describe.each([split, numpad, duo])('designed keyboard $name', (hw) => {
  const config = newHardwareConfig(hw, 'v0.3');

  it('is valid and round-trips', () => {
    expect(validateHardware(hw).filter((i) => i.level === 'error')).toEqual([]);
    expect(importConfig(generateConfig(config)).config).toEqual(config);
  });

  it.each(Object.entries(generateConfig(config)))('matches the committed %s', async (path, content) => {
    await expect(content).toMatchFileSnapshot(join('generated', hw.name, path));
  });
});
