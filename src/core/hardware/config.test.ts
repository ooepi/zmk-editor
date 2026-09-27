import { describe, expect, it } from 'vitest';
import { configPaths, generateConfig, importConfig } from '../config.ts';
import { formatBinding } from '../keymap/bindings.ts';
import { applyHardware, newHardwareConfig } from './config.ts';
import { definitionPath } from './definition.ts';
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

  it('applies a hardware edit: remaps the keymap and moves the build to the new controller', () => {
    const edited = { ...testSplit, controller: 'puchi_ble_v1', keys: testSplit.keys.slice(1) };
    const { config: next, notes } = applyHardware(config, edited, [1, 2, 3]);
    expect(next.keymap.layers[0]?.bindings.map(formatBinding)).toEqual(['&kp W', '&kp E', '&kp R']);
    expect(next.build.include.map((t) => t.board)).toEqual(['puchi_ble_v1', 'puchi_ble_v1']);
    expect(next.hardware).toBe(edited);
    expect(notes).toEqual([]);
  });
});
