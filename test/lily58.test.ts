import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configPaths, generateConfig, importConfig } from '../src/core/config.ts';
import { formatBinding } from '../src/core/keymap/bindings.ts';
import { behaviorKind } from '../src/core/keymap/model.ts';
import { findVersionMismatches } from '../src/core/files/west.ts';
import { createBehavior, renameBehavior } from '../src/core/keymap/behaviorEdit.ts';
import { createCombo } from '../src/core/keymap/comboEdit.ts';
import { generateKeymap } from '../src/core/keymap/generator.ts';
import { importKeymap } from '../src/core/keymap/importer.ts';
import { textToBindings } from '../src/core/keymap/macroText.ts';
import { setSensorBinding } from '../src/core/keymap/sensorEdit.ts';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, 'fixtures/lily58', name), 'utf8');

/** The fixture as it lives in the zmk-config repo. */
const repoFiles: Record<string, string> = {
  'config/lily58.keymap': fixture('lily58.keymap'),
  'config/lily58.conf': fixture('lily58.conf'),
  'config/west.yml': fixture('west.yml'),
  'build.yaml': fixture('build.yaml'),
};

describe('Lily58 fixture', () => {
  const { config, warnings } = importConfig(repoFiles);

  it('imports without warnings', () => {
    expect(warnings).toEqual([]);
    expect(config.keyboard).toBe('lily58');
  });

  it('reads all six layers with 58 keys each', () => {
    const { layers } = config.keymap;
    expect(layers.map((l) => l.displayName)).toEqual(['BASE', 'NAV', 'PROG', 'QWER', 'NUM', 'MOUS']);
    for (const layer of layers) expect(layer.bindings).toHaveLength(58);
    expect(layers[0]?.bindings.slice(0, 2).map(formatBinding)).toEqual(['&kp ESC', '&kp N1']);
    expect(layers[0]?.bindings[23]).toEqual({ behavior: 'uc', params: ['UC_SV_OE'] });
    expect(layers[0]?.bindings.at(-1)).toEqual({ behavior: 'kp', params: ['LG(PG_DN)'] });
    expect(layers[1]?.bindings[12]).toEqual({ behavior: 'kp', params: ['LA(LC(TAB))'] });
  });

  it('reads the encoder bindings of every layer', () => {
    expect(config.keymap.layers.map((l) => l.sensorBindings?.map(formatBinding))).toEqual([
      ['&inc_dec_kp C_VOL_UP C_VOL_DN'],
      ['&scroll_up_down'],
      ['&scroll_left_right'],
      ['&inc_dec_kp C_VOL_UP C_VOL_DN'],
      ['&inc_dec_kp C_VOL_UP C_VOL_DN'],
      ['&scroll_up_down'],
    ]);
  });

  it('reads the sensor-rotate behaviors and pointing overrides', () => {
    const { behaviors, topLevel } = config.keymap;
    expect(behaviors.map((b) => [b.label, behaviorKind(b), b.bindings.map(formatBinding)])).toEqual([
      ['scroll_up_down', 'sensor-rotate', ['&msc SCRL_DOWN', '&msc SCRL_UP']],
      ['scroll_left_right', 'sensor-rotate', ['&msc SCRL_LEFT', '&msc SCRL_RIGHT']],
    ]);
    expect(topLevel.filter((i) => i.kind === 'override').map((i) => i.node.name)).toEqual(['&mmv', '&msc']);
    expect(topLevel.filter((i) => i.kind === 'include').map((i) => i.path)).toContain('behaviors/unicode.dtsi');
    expect(topLevel.filter((i) => i.kind === 'define')).toEqual([
      { kind: 'define', name: 'ZMK_POINTING_DEFAULT_SCRL_VAL', value: '100' },
      { kind: 'define', name: 'ZMK_POINTING_DEFAULT_MOVE_VAL', value: '2400' },
    ]);
  });

  it('reads west.yml, build.yaml and the Kconfig', () => {
    expect(config.west.zmkVersion).toBe('v0.3');
    expect(config.west.modules.map((m) => m.name)).toEqual(['zmk-helpers', 'zmk-unicode']);
    expect(findVersionMismatches(config.west)).toEqual([]);
    expect(config.build.include.map((t) => t.shield)).toEqual([
      'lily58_left nice_view_adapter nice_view',
      'lily58_right nice_view_adapter nice_view',
    ]);
    expect(config.kconfig.lines).toContainEqual({ kind: 'set', name: 'CONFIG_EC11', value: 'y' });
    expect(config.kconfig.lines).toContainEqual({ kind: 'set', name: 'CONFIG_ZMK_WIDGET_WPM_STATUS', value: 'n' });
  });

  it('round-trips: import → generate → import gives the same model', () => {
    const generated = generateConfig(config);
    const again = importConfig(generated);
    expect(again.warnings).toEqual([]);
    expect(again.config).toEqual(config);
  });

  it('generates deterministic output', () => {
    const once = generateConfig(config);
    const twice = generateConfig(importConfig(once).config);
    expect(twice).toEqual(once);
  });

  it('writes every repo file, with the workflow pinned to the ZMK version', () => {
    const generated = generateConfig(config);
    // config/info.json is only written for a designer layout.
    const { info: _info, ...paths } = configPaths('lily58');
    expect(Object.keys(generated).sort()).toEqual(Object.values(paths).sort());
    expect(generated['.github/workflows/build.yml']).toContain('build-user-config.yml@v0.3');
    expect(generated['config/west.yml']).toContain('revision: v0.3');
    expect(generated['config/west.yml']).not.toMatch(/revision: (?!v0\.3)/);
  });

  // The generated files are committed under test/generated/lily58/ and built
  // with ZMK's own workflow in CI (.github/workflows/firmware.yml).
  // Update them with `npx vitest run -u`.
  it.each(Object.entries(generateConfig(config)))('matches the committed %s', async (path, content) => {
    await expect(content).toMatchFileSnapshot(join('generated/lily58', path));
  });
});

describe('Lily58 fixture after Milestone 4 edits', () => {
  it('still round-trips with a new hold-tap, macro, combo, renamed behavior and encoder binding', () => {
    let keymap = importConfig(repoFiles).config.keymap;
    const holdTap = createBehavior(keymap, 'hold-tap');
    keymap = { ...keymap, behaviors: [...keymap.behaviors, holdTap] };
    const macro = { ...createBehavior(keymap, 'macro'), bindings: textToBindings('Hello!').bindings };
    keymap = { ...keymap, behaviors: [...keymap.behaviors, macro] };
    keymap = { ...keymap, combos: [createCombo(keymap, [13, 14], { behavior: macro.label ?? '', params: [] })] };
    keymap = renameBehavior(keymap, 'scroll_up_down', 'scroll_v');
    keymap = setSensorBinding(keymap, 2, 0, { behavior: 'inc_dec_kp', params: ['PG_UP', 'PG_DN'] });

    expect(keymap.layers[1]?.sensorBindings?.map(formatBinding)).toEqual(['&scroll_v']);
    const text = generateKeymap(keymap);
    expect(importKeymap(text).model).toEqual(keymap);
  });
});
