import { describe, expect, it } from 'vitest';
import { configPaths, generateConfig, importConfig } from '../config.ts';
import { formatBinding } from '../keymap/bindings.ts';
import { applyHardware, hardwareBuildTargets, newHardwareConfig } from './config.ts';
import { setDisplay, setDisplayPin } from './displays.ts';
import { definitionPath, serializeHardware } from './definition.ts';
import { handEditedShieldFiles } from './generate.ts';
import { testSplit } from './testFixtures.ts';

const config = newHardwareConfig(testSplit, 'v0.3');

describe('configs with a designed keyboard', () => {
  it('builds each half on the chosen controller', () => {
    expect(config.keyboard).toBe('test_split');
    expect(config.build.include).toEqual([
      { board: 'nice_nano_v2', shield: 'test_split_left' },
      { board: 'nice_nano_v2', shield: 'test_split_right' },
    ]);
    expect(config.keymap.layers[0]?.bindings).toHaveLength(4);
  });

  it('writes the shield files instead of info.json', () => {
    const files = generateConfig(config);
    expect(files[definitionPath('test_split')]).toBeDefined();
    expect(files['config/boards/shields/test_split/test_split_right.overlay']).toContain('col-offset = <2>;');
    expect(files[configPaths('test_split').info]).toBeUndefined();
  });

  it('round-trips and is deterministic', () => {
    const generated = generateConfig(config);
    const again = importConfig(generated);
    expect(again.warnings).toEqual([]);
    expect(again.config).toEqual(config);
    expect(generateConfig(again.config)).toEqual(generated);
  });

  it('warns about shield files changed outside the editor', () => {
    const files = generateConfig(config);
    const overlay = 'config/boards/shields/test_split/test_split_left.overlay';
    files[overlay] = `${files[overlay]}/* tweak */\n`;
    expect(handEditedShieldFiles(files, 'test_split')).toEqual([overlay]);
    expect(importConfig(files).warnings).toEqual([`${overlay} was changed outside the editor; committing replaces it with the editor’s version.`]);
  });

  it('ignores Windows line endings when comparing', () => {
    const files = generateConfig(config);
    const kconfig = 'config/boards/shields/test_split/Kconfig.shield';
    files[kconfig] = (files[kconfig] ?? '').replace(/\n/g, '\r\n');
    expect(handEditedShieldFiles(files, 'test_split')).toEqual([]);
  });

  it('keeps going when the definition is broken', () => {
    const files = { ...generateConfig(config), [definitionPath('test_split')]: '{' };
    const { config: imported, warnings } = importConfig(files);
    expect(imported.hardware).toBeUndefined();
    expect(warnings[0]).toMatch(/^Ignored config\/boards\/shields\/test_split\/test_split\.editor\.json: /);
  });

  it('ignores a definition that describes a different keyboard', () => {
    const mismatched = { ...testSplit, name: 'other_name' };
    const files = { ...generateConfig(config), [definitionPath('test_split')]: serializeHardware(mismatched) };
    const { config: imported, warnings } = importConfig(files, 'test_split');
    expect(imported.hardware).toBeUndefined();
    expect(warnings).toContain(
      `Ignored ${definitionPath('test_split')}: it describes “other_name”, but the keymap is config/test_split.keymap.`,
    );
  });

  it('adds validateHardware errors to the import warnings', () => {
    const broken = { ...testSplit, wiring: { ...testSplit.wiring, rows: [null] } } as typeof testSplit;
    const files = { ...generateConfig(config), [definitionPath('test_split')]: serializeHardware(broken) };
    const { warnings } = importConfig(files);
    expect(warnings).toContain('Keyboard hardware: Row 0 on the left half has no pin.');
  });

  it('applies a hardware edit: remaps the keymap and moves the build to the new controller', () => {
    const edited = { ...testSplit, controller: 'puchi_ble_v1', keys: testSplit.keys.slice(1) };
    const { config: next, notes } = applyHardware(config, edited, [1, 2, 3]);
    expect(next.keymap.layers[0]?.bindings.map(formatBinding)).toEqual(['&kp W', '&kp E', '&kp R']);
    expect(next.build.include.map((t) => t.board)).toEqual(['puchi_ble_v1', 'puchi_ble_v1']);
    expect(next.hardware).toBe(edited);
    expect(notes).toEqual([]);
  });
  it('starts encoders on volume, and keeps their bindings when hardware is edited', () => {
    const withEncoder = { ...testSplit, encoders: [{ a: 8, b: 9 }] };
    const start = newHardwareConfig(withEncoder, 'v0.3');
    expect(start.keymap.layers[0]?.sensorBindings?.map(formatBinding)).toEqual(['&inc_dec_kp C_VOL_UP C_VOL_DN', '&inc_dec_kp C_VOL_UP C_VOL_DN']);
    const custom = { ...start, keymap: { ...start.keymap, layers: start.keymap.layers.map((l) => ({ ...l, sensorBindings: [{ behavior: 'inc_dec_kp', params: ['PG_UP', 'PG_DN'] }, { behavior: 'inc_dec_kp', params: ['C_VOL_UP', 'C_VOL_DN'] }] })) } };
    // Add a second left encoder (and its mirror): sensor order left 0, left 1, right 0, right 1.
    const two = { ...withEncoder, encoders: [{ a: 8, b: 9 }, { a: 10, b: 16 }] };
    const { config } = applyHardware(custom, two, testSplit.keys.map((_, i) => i), [0, undefined, 1, undefined]);
    expect(config.keymap.layers[0]?.sensorBindings?.map(formatBinding)).toEqual([
      '&inc_dec_kp PG_UP PG_DN',
      '&inc_dec_kp C_VOL_UP C_VOL_DN',
      '&inc_dec_kp C_VOL_UP C_VOL_DN',
      '&inc_dec_kp C_VOL_UP C_VOL_DN',
    ]);
    expect(importConfig(generateConfig(config)).config).toEqual(config);
  });
  it('adds the nice!view shields to the halves that have one, and follows later display changes', () => {
    const viewLeft = setDisplay(testSplit, 'left', 'nice_view');
    const start = newHardwareConfig(viewLeft, 'v0.3');
    expect(start.build.include.map((t) => t.shield)).toEqual(['test_split_left nice_view_adapter nice_view', 'test_split_right']);
    // A nice!view Gem (module) replacing nice_view is kept while the display stays a nice!view…
    const gem = { ...start, build: { include: start.build.include.map((t, i) => (i === 0 ? { ...t, shield: 'test_split_left nice_view_adapter nice_view_gem' } : t)) } };
    const both = setDisplay(viewLeft, 'right', 'nice_view');
    expect(applyHardware(gem, both, testSplit.keys.map((_, i) => i)).config.build.include.map((t) => t.shield)).toEqual([
      'test_split_left nice_view_adapter nice_view_gem',
      'test_split_right nice_view_adapter nice_view',
    ]);
    // …and removed with it.
    const oled = setDisplay(setDisplay(testSplit, 'left', 'oled_128x32'), 'right', undefined);
    expect(applyHardware(gem, oled, testSplit.keys.map((_, i) => i)).config.build.include.map((t) => t.shield)).toEqual(['test_split_left', 'test_split_right']);
  });

  it('leaves build targets alone when a half’s display didn’t change', () => {
    // A keyboard from before displays existed, with a nice!view added to build.yaml by hand.
    const start = newHardwareConfig(testSplit, 'v0.3');
    const legacy = { ...start, build: { include: start.build.include.map((t) => ({ ...t, shield: `${t.shield} rgbled_adapter nice_view_adapter nice_view` })) } };
    const { config } = applyHardware(legacy, testSplit, testSplit.keys.map((_, i) => i));
    expect(config.build.include.map((t) => t.shield)).toEqual([
      'test_split_left rgbled_adapter nice_view_adapter nice_view',
      'test_split_right rgbled_adapter nice_view_adapter nice_view',
    ]);
  });

  it('moves the build to a XIAO, dropping nice!view shields its adapter can’t fit, with a note', () => {
    const start = newHardwareConfig(testSplit, 'v0.3');
    const legacy = { ...start, build: { include: start.build.include.map((t) => ({ ...t, shield: `${t.shield} rgbled_adapter nice_view_adapter nice_view` })) } };
    const xiao = { ...testSplit, controller: 'seeeduino_xiao_ble' };
    const { config, notes } = applyHardware(legacy, xiao, testSplit.keys.map((_, i) => i));
    expect(config.build.include).toEqual([
      { board: 'seeeduino_xiao_ble', shield: 'test_split_left rgbled_adapter' },
      { board: 'seeeduino_xiao_ble', shield: 'test_split_right rgbled_adapter' },
    ]);
    expect(notes).toContain('Removed the nice!view from the build: on this controller it needs to be turned on under Displays, which sets up its pins.');
    expect(applyHardware(start, xiao, testSplit.keys.map((_, i) => i)).notes).toEqual([]);
    expect(newHardwareConfig(xiao, 'v0.3').build.include.map((t) => t.board)).toEqual(['seeeduino_xiao_ble', 'seeeduino_xiao_ble']);
  });

  it('builds a nice!view without the adapter when the shield sets up its own SPI bus', () => {
    const xiao = setDisplay({ ...testSplit, controller: 'seeeduino_xiao_ble' }, 'left', 'nice_view');
    expect(hardwareBuildTargets(xiao)).toEqual([
      { board: 'seeeduino_xiao_ble', shield: 'test_split_left nice_view' },
      { board: 'seeeduino_xiao_ble', shield: 'test_split_right' },
    ]);
    const moved = setDisplayPin(setDisplay(testSplit, 'left', 'nice_view'), 'left', 'cs', 5);
    expect(hardwareBuildTargets(moved)[0]?.shield).toBe('test_split_left nice_view');
  });

  it('swaps the adapter in and out as the pins change, keeping the chosen screen', () => {
    const keys = testSplit.keys.map((_, i) => i);
    const viewLeft = setDisplay(testSplit, 'left', 'nice_view');
    const start = newHardwareConfig(viewLeft, 'v0.3');
    const gem = { ...start, build: { include: start.build.include.map((t, i) => (i === 0 ? { ...t, shield: 'test_split_left nice_view_adapter nice_view_gem' } : t)) } };
    const moved = applyHardware(gem, setDisplayPin(viewLeft, 'left', 'cs', 5), keys).config;
    expect(moved.build.include[0]?.shield).toBe('test_split_left nice_view_gem');
    const back = applyHardware(moved, viewLeft, keys);
    expect(back.config.build.include[0]?.shield).toBe('test_split_left nice_view_adapter nice_view_gem');
    expect(back.notes).toEqual([]);
  });

  it('removes an adapter added by hand next to a nice!view with its own SPI bus', () => {
    const keys = testSplit.keys.map((_, i) => i);
    const moved = setDisplayPin(setDisplay(testSplit, 'left', 'nice_view'), 'left', 'cs', 5);
    const start = newHardwareConfig(moved, 'v0.3');
    const handEdited = { ...start, build: { include: start.build.include.map((t, i) => (i === 0 ? { ...t, shield: 'test_split_left nice_view_adapter nice_view' } : t)) } };
    expect(applyHardware(handEdited, moved, keys).config.build.include[0]?.shield).toBe('test_split_left nice_view');
    const xiao = setDisplay({ ...testSplit, controller: 'seeeduino_xiao_ble' }, 'left', 'nice_view');
    const onXiao = { ...handEdited, hardware: xiao };
    const result = applyHardware(onXiao, xiao, keys);
    expect(result.config.build.include[0]?.shield).toBe('test_split_left nice_view');
    expect(result.notes).toEqual([]);
  });

  it('keeps a XIAO’s nice!view in the build and moves a Pro Micro’s back onto the adapter', () => {
    const keys = testSplit.keys.map((_, i) => i);
    const xiao = setDisplay({ ...testSplit, controller: 'seeeduino_xiao_ble' }, 'left', 'nice_view');
    const onPro = newHardwareConfig(setDisplay(testSplit, 'left', 'nice_view'), 'v0.3');
    const toXiao = applyHardware(onPro, xiao, keys);
    expect(toXiao.config.build.include[0]).toEqual({ board: 'seeeduino_xiao_ble', shield: 'test_split_left nice_view' });
    expect(toXiao.notes).toEqual([]);
    // Back on a Pro Micro, the XIAO's default pins become the adapter's defaults.
    const toPro = applyHardware(toXiao.config, { ...xiao, controller: 'nice_nano_v2' }, keys);
    expect(toPro.config.build.include[0]).toEqual({ board: 'nice_nano_v2', shield: 'test_split_left nice_view_adapter nice_view' });
  });

  it('keeps the shield order when a nice!view is chosen that build.yaml already has', () => {
    const start = newHardwareConfig(testSplit, 'v0.3');
    const legacy = { ...start, build: { include: start.build.include.map((t) => ({ ...t, shield: `${t.shield} rgbled_adapter nice_view_adapter nice_view` })) } };
    const withView = setDisplay(testSplit, 'left', 'nice_view');
    const { config } = applyHardware(legacy, withView, testSplit.keys.map((_, i) => i));
    expect(config.build.include.map((t) => t.shield)[0]).toBe('test_split_left rgbled_adapter nice_view_adapter nice_view');
  });
});
