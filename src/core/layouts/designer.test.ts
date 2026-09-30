import { describe, expect, it } from 'vitest';
import { findKeyboard, layoutsFor } from '../catalog/keyboards.ts';
import { generateConfig, importConfig } from '../config.ts';
import { physicalLayoutFor } from './index.ts';
import { layoutDtsi } from './dtsi.ts';
import { generateInfoJson, parseInfoJson } from './qmkInfo.ts';
import { gridTemplate, splitTemplate } from './templates.ts';
import type { PhysicalLayout } from './types.ts';

const layout: PhysicalLayout = {
  name: 'custom',
  keys: [
    { x: 0, y: 0, w: 100, h: 100, r: 0, rx: 0, ry: 0 },
    { x: 125, y: 25, w: 150, h: 100, r: 15, rx: 200, ry: 75 },
  ],
};

describe('info.json (QMK format)', () => {
  it('writes key units and leaves out defaults', () => {
    expect(JSON.parse(generateInfoJson(layout))).toEqual({
      layouts: {
        LAYOUT: {
          layout: [
            { x: 0, y: 0 },
            { x: 1.25, y: 0.25, w: 1.5, r: 15, rx: 2, ry: 0.75 },
          ],
        },
      },
    });
  });

  it('reads it back', () => {
    expect(parseInfoJson(generateInfoJson(layout))).toEqual(layout);
  });

  it('keeps encoder knob positions in its own section, only when there are some', () => {
    const withKnobs: PhysicalLayout = { ...layout, encoders: [null, { x: 350, y: 225 }] };
    const text = generateInfoJson(withKnobs);
    expect(JSON.parse(text).zmk_editor).toEqual({ encoders: [null, { x: 3.5, y: 2.25 }] });
    expect(parseInfoJson(text)).toEqual(withKnobs);
    expect(generateInfoJson({ ...layout, encoders: [null] })).not.toContain('zmk_editor');
  });

  it('reads the first layout of QMK-style files and rejects junk', () => {
    const qmk = JSON.stringify({ keyboard_name: 'x', layouts: { LAYOUT_split: { layout: [{ label: 'Q', x: 1, y: 2 }] } } });
    expect(parseInfoJson(qmk)?.keys).toEqual([{ x: 100, y: 200, w: 100, h: 100, r: 0, rx: 0, ry: 0 }]);
    expect(parseInfoJson('not json')).toBeNull();
    expect(parseInfoJson('{"layouts": {}}')).toBeNull();
  });
});

describe('ZMK physical layout snippet', () => {
  it('uses key_physical_attrs with rotation in centi-degrees', () => {
    const text = layoutDtsi(layout, 'my_board');
    expect(text).toContain('my_board_layout: my_board_layout {');
    expect(text).toContain('compatible = "zmk,physical-layout";');
    expect(text).toContain('<&key_physical_attrs 100 100    0    0      0    0    0>');
    expect(text).toContain('<&key_physical_attrs 150 100  125   25   1500  200   75>');
  });

  it('writes negative rotation in parentheses', () => {
    const second = layout.keys[1] ?? layout.keys[0];
    if (!second) throw new Error('no key');
    const rotated = { ...layout, keys: [{ ...second, r: -30 }] };
    expect(layoutDtsi(rotated, 'x')).toContain('(-3000)');
  });

  it('prints the whole node exactly (guards the refactor for custom keyboards)', () => {
    expect(layoutDtsi(layout, 'my_board')).toBe(`#include <physical_layouts.dtsi>

/ {
    my_board_layout: my_board_layout {
        compatible = "zmk,physical-layout";
        display-name = "my_board";

        keys  //                     w   h    x    y     rot   rx   ry
            = <&key_physical_attrs 100 100    0    0      0    0    0>
            , <&key_physical_attrs 150 100  125   25   1500  200   75>
            ;
    };
};
`);
  });
});

describe('templates', () => {
  it('makes a grid with exactly the requested key count, row by row', () => {
    const grid = gridTemplate(10, 4);
    expect(grid.keys).toHaveLength(10);
    expect(grid.keys.slice(0, 5).map((k) => [k.x, k.y])).toEqual([
      [0, 0],
      [100, 0],
      [200, 0],
      [300, 0],
      [0, 100],
    ]);
  });

  it('makes a split layout: rows across both halves, then thumbs', () => {
    const split = splitTemplate(42, { columns: 6, thumbs: 3 });
    expect(split.keys).toHaveLength(42);
    // First row: 6 left keys, then 6 right keys after a gap.
    expect(split.keys.slice(0, 12).map((k) => k.x)).toEqual([0, 100, 200, 300, 400, 500, 800, 900, 1000, 1100, 1200, 1300]);
    // Thumbs: 3 per half, in the last row, near the middle.
    expect(split.keys.slice(36).map((k) => k.x)).toEqual([300, 400, 500, 800, 900, 1000]);
    expect(new Set(split.keys.slice(36).map((k) => k.y))).toEqual(new Set([300]));
  });

  it('puts leftover keys on a last row when the count does not divide evenly', () => {
    const split = splitTemplate(45, { columns: 6, thumbs: 3 });
    expect(split.keys).toHaveLength(45);
  });

  it('matches catalog layouts in size, so they can be starting points', () => {
    const corne = findKeyboard('corne');
    expect(corne && layoutsFor(corne, 42)[0]?.keys).toHaveLength(42);
  });
});

describe('custom layout in the config', () => {
  const keymap = `/ { keymap { compatible = "zmk,keymap"; l { bindings = <&kp A &kp B>; }; }; };`;
  const west = 'manifest:\n  projects:\n    - name: zmk\n      revision: v0.3\n      remote: zmkfirmware\n';

  it('reads config/info.json and writes it back', () => {
    const files = { 'config/my_kb.keymap': keymap, 'config/west.yml': west, 'config/info.json': generateInfoJson(layout) };
    const { config, warnings } = importConfig(files);
    expect(warnings).toEqual([]);
    expect(config.layout).toEqual(layout);
    expect(generateConfig(config)['config/info.json']).toBe(generateInfoJson(layout));
    expect(physicalLayoutFor('my_kb', 2, undefined, config.layout)).toBe(config.layout);
  });

  it('warns when the saved layout has a different key count', () => {
    const one = { ...layout, keys: layout.keys.slice(0, 1) };
    const files = { 'config/my_kb.keymap': keymap, 'config/west.yml': west, 'config/info.json': generateInfoJson(one) };
    expect(importConfig(files).warnings).toEqual([expect.stringMatching(/has 1 keys but the keymap has 2/)]);
  });

  it('does not write info.json without a custom layout', () => {
    const { config } = importConfig({ 'config/my_kb.keymap': keymap, 'config/west.yml': west });
    expect(Object.keys(generateConfig(config))).not.toContain('config/info.json');
  });
});
