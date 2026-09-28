import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateConfig, importConfig } from '../src/core/config.ts';
import { newHardwareConfig } from '../src/core/hardware/config.ts';
import { addLayer } from '../src/core/keymap/edit.ts';
import { setSensorBinding } from '../src/core/keymap/sensorEdit.ts';
import { DEFAULT_BASICS, gridHardware } from '../src/core/hardware/grid.ts';
import type { KeyboardHardware } from '../src/core/hardware/types.ts';
import { validateHardware } from '../src/core/hardware/validate.ts';

/**
 * A 3×6+3 split (Corne-like), COL2ROW, right half mirrored; the Corne's pins.
 * The innermost thumb key on each half is 1.25u wide and rotated around its
 * own centre (toward the other half), and one left-half key sits left of the
 * origin: this proves the generated devicetree survives negative offsets and
 * rotated, non-1u keys (see F1 of the final review).
 */
const split: KeyboardHardware = (() => {
  const hw = gridHardware({ ...DEFAULT_BASICS, name: 'editor_split', displayName: 'Editor Split', rows: 4, cols: 6 });
  const keys = hw.keys
    .filter((k) => k.row !== 3 || (k.side === 'left' ? k.col >= 3 : k.col <= 2))
    .map((k) => {
      if (k.row === 3 && k.side === 'left' && k.col === 5) return { ...k, w: 125, r: 15, rx: k.x + 125 / 2, ry: k.y + k.h / 2 };
      if (k.row === 3 && k.side === 'right' && k.col === 0) return { ...k, w: 125, r: -15, rx: k.x + 125 / 2, ry: k.y + k.h / 2 };
      if (k.row === 0 && k.col === 0 && k.side === 'left') return { ...k, x: -25 };
      return k;
    });
  return {
    ...hw,
    wiring: { kind: 'matrix', diodeDirection: 'col2row', rows: [4, 5, 6, 7], cols: [21, 20, 19, 18, 15, 14] },
    keys,
    // One encoder per half; the right one mirrors it (A and B swapped).
    encoders: [{ a: 8, b: 9 }],
    // A nice!view on both halves (ZMK's adapter shields, on D1-D3).
    displays: { left: 'nice_view', right: 'nice_view' },
  };
})();

/** A 5×4 numpad, ROW2COL, one piece, with one encoder and a 128×64 OLED. */
const numpad: KeyboardHardware = {
  ...gridHardware({ ...DEFAULT_BASICS, name: 'editor_numpad', displayName: 'Editor Numpad', controller: 'puchi_ble_v1', split: false, rows: 5, cols: 4, diodeDirection: 'row2col' }),
  wiring: { kind: 'matrix', diodeDirection: 'row2col', rows: [4, 5, 6, 7, 8], cols: [9, 10, 14, 15] },
  encoders: [{ a: 16, b: 18 }],
  // A 128x64 OLED on the I2C pins D2/D3 (the Kyria's node).
  displays: { left: 'oled_128x64' },
};

/** A 2×3 direct-wired split whose right half has its own pins. */
const duo: KeyboardHardware = {
  ...gridHardware({ ...DEFAULT_BASICS, name: 'editor_duo', displayName: 'Editor Duo', controller: 'bluemicro840_v1', wiring: 'direct', rows: 2, cols: 3 }),
  wiring: { kind: 'direct', pins: [4, 5, 6, 7, 8, 9], right: [21, 20, 19, 18, 15, 14] },
  // An encoder on the left half only: the right half has its own (empty) list.
  encoders: [{ a: 10, b: 16 }],
  rightEncoders: [],
  // A 128x32 OLED on the left half only (the Corne's node).
  displays: { left: 'oled_128x32' },
};

/**
 * The split also gets a Nav layer without encoder bindings (they fall through)
 * and an Fn layer binding only the first encoder: real ZMK must accept both,
 * as &trans can't be listed in sensor-bindings.
 */
function withLayers(config: ReturnType<typeof newHardwareConfig>): ReturnType<typeof newHardwareConfig> {
  if (config.keyboard !== 'editor_split') return config;
  const layers = addLayer(addLayer(config.keymap, 'Nav'), 'Fn');
  return { ...config, keymap: setSensorBinding(layers, 2, 0, { behavior: 'inc_dec_kp', params: ['PG_UP', 'PG_DN'] }) };
}

// Built with ZMK in CI (.github/workflows/firmware.yml). Update with `npx vitest run -u`.
describe.each([split, numpad, duo])('designed keyboard $name', (hw) => {
  const config = withLayers(newHardwareConfig(hw, 'v0.3'));

  it('is valid and round-trips', () => {
    expect(validateHardware(hw).filter((i) => i.level === 'error')).toEqual([]);
    expect(importConfig(generateConfig(config)).config).toEqual(config);
  });

  it.each(Object.entries(generateConfig(config)))('matches the committed %s', async (path, content) => {
    await expect(content).toMatchFileSnapshot(join('generated', hw.name, path));
  });
});
