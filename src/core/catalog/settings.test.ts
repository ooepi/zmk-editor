import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importConfig } from '../config.ts';
import { generateKconfig, parseKconfig } from '../files/kconfig.ts';
import { newHardwareConfig } from '../hardware/config.ts';
import { testSplit } from '../hardware/testFixtures.ts';
import { findSetting, readSetting, SETTINGS, settingWarnings, unsupportedHardwareSettings, writeSetting } from './settings.ts';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, '../../../test/fixtures/lily58', name), 'utf8');
const load = () =>
  importConfig({
    'config/lily58.keymap': fixture('lily58.keymap'),
    'config/lily58.conf': fixture('lily58.conf'),
    'config/west.yml': fixture('west.yml'),
    'build.yaml': fixture('build.yaml'),
  }).config;

const setting = (name: string) => {
  const def = findSetting(name);
  if (!def) throw new Error(name);
  return def;
};

describe('settings catalog', () => {
  it('has unique names, and every setting belongs to a group', () => {
    const names = SETTINGS.flatMap((s) => (s.type.kind === 'choice' ? s.type.options.map((o) => o.name) : [s.name]));
    expect(new Set(names).size).toBe(names.length);
  });

  it('reads the fixture values', () => {
    const { kconfig } = load();
    expect(readSetting(kconfig, setting('ZMK_SLEEP'))).toBe(true);
    expect(readSetting(kconfig, setting('ZMK_IDLE_TIMEOUT'))).toBe(300000);
    expect(readSetting(kconfig, setting('ZMK_RGB_UNDERGLOW'))).toBeUndefined();
    expect(readSetting(kconfig, setting('BT_CTLR_TX_PWR'))).toBe('BT_CTLR_TX_PWR_PLUS_8');
    expect(readSetting(kconfig, setting('ZMK_WIDGET_WPM_STATUS'))).toBe(false);
  });
});

describe('writeSetting', () => {
  it('changes a value in place and keeps comments', () => {
    const { kconfig } = load();
    const next = writeSetting(kconfig, setting('ZMK_IDLE_TIMEOUT'), 60000);
    const text = generateKconfig(next);
    expect(text).toContain('# Battery saving stuff\nCONFIG_ZMK_IDLE_TIMEOUT=60000\n');
    expect(text).toContain('#CONFIG_NICE_OLED_GEM_ANIMATION_MS=960');
  });

  it('appends new settings and removes ones set back to default', () => {
    let kconfig = parseKconfig('CONFIG_ZMK_SLEEP=y\n');
    kconfig = writeSetting(kconfig, setting('ZMK_RGB_UNDERGLOW'), true);
    kconfig = writeSetting(kconfig, setting('ZMK_KEYBOARD_NAME'), 'Lily "58"');
    expect(generateKconfig(kconfig)).toBe('CONFIG_ZMK_SLEEP=y\nCONFIG_ZMK_RGB_UNDERGLOW=y\nCONFIG_ZMK_KEYBOARD_NAME="Lily \\"58\\""\n');
    expect(readSetting(kconfig, setting('ZMK_KEYBOARD_NAME'))).toBe('Lily "58"');
    kconfig = writeSetting(kconfig, setting('ZMK_SLEEP'), undefined);
    expect(generateKconfig(kconfig)).not.toContain('ZMK_SLEEP');
  });

  it('writes bools explicitly, so turning off a board default works', () => {
    const kconfig = writeSetting(parseKconfig(''), setting('ZMK_DISPLAY'), false);
    expect(generateKconfig(kconfig)).toBe('CONFIG_ZMK_DISPLAY=n\n');
  });

  it('sets one option of a choice and drops the others', () => {
    const { kconfig } = load();
    const next = writeSetting(kconfig, setting('BT_CTLR_TX_PWR'), 'BT_CTLR_TX_PWR_PLUS_4');
    const text = generateKconfig(next);
    expect(text).toContain('CONFIG_BT_CTLR_TX_PWR_PLUS_4=y');
    expect(text).not.toContain('PLUS_8');
    expect(generateKconfig(writeSetting(next, setting('BT_CTLR_TX_PWR'), undefined))).not.toContain('TX_PWR');
  });
});

describe('settingWarnings', () => {
  it('is quiet for the working fixture', () => {
    expect(settingWarnings(load())).toEqual([]);
  });

  it('flags keymap features whose settings are off, with a fix', () => {
    const config = load();
    const kconfig = writeSetting(config.kconfig, setting('ZMK_POINTING'), undefined);
    const layers = config.keymap.layers.map((l, i) => (i === 0 ? { ...l, bindings: l.bindings.with(0, { behavior: 'rgb_ug', params: ['RGB_TOG'] }) } : l));
    const warnings = settingWarnings({ ...config, kconfig, keymap: { ...config.keymap, layers } });
    expect(warnings.map((w) => w.fix)).toEqual([
      { name: 'ZMK_POINTING', value: true },
      { name: 'ZMK_RGB_UNDERGLOW', value: true },
    ]);
  });

  it('flags a sleep timeout shorter than the idle timeout', () => {
    const config = load();
    const kconfig = writeSetting(config.kconfig, setting('ZMK_IDLE_SLEEP_TIMEOUT'), 1000);
    expect(settingWarnings({ ...config, kconfig }).map((w) => w.message)).toEqual([expect.stringMatching(/sleep.*before.*idle/i)]);
  });
});

describe('settings a designed keyboard has no hardware for', () => {
  const designed = newHardwareConfig(testSplit, 'v0.3');
  const turnOn = (name: string) => {
    const def = findSetting(name);
    if (!def) throw new Error(name);
    return { ...designed, kconfig: writeSetting(designed.kconfig, def, true) };
  };

  it('flags the display, underglow, backlight and encoders when they are on', () => {
    expect(unsupportedHardwareSettings(designed)).toEqual([]);
    expect(unsupportedHardwareSettings(turnOn('ZMK_DISPLAY'))).toEqual([
      { name: 'ZMK_DISPLAY', message: 'Display is on, but Test Split has no screen yet, so the firmware won’t build.' },
    ]);
    expect(unsupportedHardwareSettings(turnOn('ZMK_RGB_UNDERGLOW')).map((s) => s.name)).toEqual(['ZMK_RGB_UNDERGLOW']);
    expect(unsupportedHardwareSettings(turnOn('ZMK_BACKLIGHT')).map((s) => s.name)).toEqual(['ZMK_BACKLIGHT']);
    expect(unsupportedHardwareSettings(turnOn('EC11')).map((s) => s.name)).toEqual(['EC11']);
  });

  it('allows the display when a display shield is built with the keyboard', () => {
    const withView = { ...turnOn('ZMK_DISPLAY'), build: { include: designed.build.include.map((t) => ({ ...t, shield: `${t.shield} nice_view_adapter nice_view` })) } };
    expect(unsupportedHardwareSettings(withView)).toEqual([]);
  });

  it('never flags catalog keyboards, whose shields bring their own hardware', () => {
    const lily = load();
    const def = findSetting('ZMK_RGB_UNDERGLOW');
    if (!def) throw new Error('setting');
    expect(unsupportedHardwareSettings({ ...lily, kconfig: writeSetting(lily.kconfig, def, true) })).toEqual([]);
  });

  it('offers turning it off instead of suggesting to turn it on', () => {
    const def = findSetting('ZMK_RGB_UNDERGLOW');
    if (!def) throw new Error('setting');
    const keymap = { ...designed.keymap, layers: designed.keymap.layers.map((l, i) => (i === 0 ? { ...l, bindings: [{ behavior: 'rgb_ug', params: ['RGB_TOG'] }, ...l.bindings.slice(1)] } : l)) };
    // The keymap uses &rgb_ug, but the keyboard has no LED strip: no "turn on" nudge.
    expect(settingWarnings({ ...designed, keymap }).some((w) => w.fix?.name === 'ZMK_RGB_UNDERGLOW')).toBe(false);
    const on = { ...designed, keymap, kconfig: writeSetting(designed.kconfig, def, true) };
    expect(settingWarnings(on)).toContainEqual({
      message: 'RGB underglow is on, but Test Split has no LED strip yet, so the firmware won’t build.',
      fix: { name: 'ZMK_RGB_UNDERGLOW', value: false },
    });
  });
  it('treats encoders as supported and on when the keyboard has them', () => {
    const withEncoder = newHardwareConfig({ ...testSplit, encoders: [{ a: 8, b: 9 }] }, 'v0.3');
    const def = findSetting('EC11');
    if (!def) throw new Error('setting');
    expect(unsupportedHardwareSettings({ ...withEncoder, kconfig: writeSetting(withEncoder.kconfig, def, true) })).toEqual([]);
    // No line in the .conf: ZMK turns EC11 on for the enabled encoder nodes, so no warning.
    expect(settingWarnings(withEncoder).some((w) => w.fix?.name === 'EC11')).toBe(false);
    // Written off explicitly: the encoders wouldn't work, so offer to turn it on.
    const off = { ...withEncoder, kconfig: writeSetting(withEncoder.kconfig, def, false) };
    expect(settingWarnings(off)).toContainEqual(expect.objectContaining({ fix: { name: 'EC11', value: true } }));
  });
});
