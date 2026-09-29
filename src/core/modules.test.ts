import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importConfig } from './config.ts';
import { formatBinding } from './keymap/bindings.ts';
import { describeBinding } from './keymap/display.ts';
import {
  addCustomModule,
  addModule,
  addTemplateBehavior,
  followZmkVersion,
  hasModuleShield,
  moduleVersionMismatches,
  parseModuleRepo,
  setModuleShield,
  getUnicodeMode,
  installedModules,
  removeModule,
  setUnicodeMode,
  setZmkVersion,
} from './modules.ts';
import { generateKeymap } from './keymap/generator.ts';
import { importKeymap } from './keymap/importer.ts';
import { behaviorCatalog, findBehavior } from './catalog/behaviors.ts';
import { findModule } from './catalog/modules.ts';
import { readKconfigValue } from './files/kconfig.ts';
import { behaviorSource, parseBehaviorSource } from './keymap/behaviorSource.ts';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, '../../test/fixtures/lily58', name), 'utf8');
const load = () =>
  importConfig({
    'config/lily58.keymap': fixture('lily58.keymap'),
    'config/lily58.conf': fixture('lily58.conf'),
    'config/west.yml': fixture('west.yml'),
    'build.yaml': fixture('build.yaml'),
  }).config;

const includes = (config: ReturnType<typeof load>) =>
  config.keymap.topLevel.flatMap((i) => (i.kind === 'include' ? [i.path] : []));

describe('modules', () => {
  it('detects the fixture modules', () => {
    expect(installedModules(load()).map((m) => m.id)).toEqual(['zmk-unicode', 'zmk-helpers']);
  });

  it('adds a module to west.yml and the keymap includes', () => {
    const config = addModule(load(), 'zmk-auto-layer');
    expect(config.west.modules.at(-1)).toEqual({ name: 'zmk-auto-layer', remote: 'urob', urlBase: 'https://github.com/urob' });
    expect(includes(config)).toContain('behaviors/num_word.dtsi');
    expect(installedModules(config).map((m) => m.id)).toContain('zmk-auto-layer');
    expect(addModule(config, 'zmk-auto-layer')).toBe(config);
  });

  it('refuses a module without a tag for the ZMK version', () => {
    const config = removeModule(load(), 'zmk-unicode').config;
    const old = setZmkVersion(config, 'v0.2');
    if (!old.ok) throw new Error('should switch');
    expect(() => addModule(old.config, 'zmk-unicode')).toThrow(/v0\.2/);
  });

  it('removes a module, its includes, and bindings that used it', () => {
    const { config, replaced } = removeModule(load(), 'zmk-unicode');
    expect(config.west.modules.map((m) => m.name)).toEqual(['zmk-helpers']);
    expect(includes(config)).not.toContain('behaviors/unicode.dtsi');
    expect(replaced).toBe(2);
    expect(config.keymap.layers[0]?.bindings[23]).toEqual({ behavior: 'none', params: [] });
  });

  it("offers a module's behaviors when the keymap includes the module", () => {
    const config = load();
    expect(findBehavior(behaviorCatalog(config.keymap), 'uc')?.params).toEqual([{ kind: 'unicode' }]);
    const without = removeModule(config, 'zmk-unicode').config.keymap;
    expect(findBehavior(behaviorCatalog(without), 'uc')).toBeUndefined();
  });

  it('labels unicode keys', () => {
    const binding = load().keymap.layers[0]?.bindings[23];
    if (!binding) throw new Error('missing binding');
    expect(describeBinding(binding, load().keymap)).toEqual({ main: 'ö', sub: 'Ö', kind: 'key' });
  });
});

describe('ZMK version', () => {
  it('blocks versions an installed module does not support', () => {
    const result = setZmkVersion(load(), 'v0.2');
    expect(result).toEqual({ ok: false, blockedBy: ['zmk-unicode'] });
  });

  it('switches everything together when allowed', () => {
    const config = removeModule(load(), 'zmk-unicode').config;
    const result = setZmkVersion(config, 'v0.2');
    if (!result.ok) throw new Error('should switch');
    expect(result.config.west.zmkVersion).toBe('v0.2');
    expect(result.config.west.modules.every((m) => m.revision === undefined)).toBe(true);
  });

  it('makes a pinned module follow the ZMK version', () => {
    const config = load();
    const pinned = { ...config, west: { ...config.west, modules: config.west.modules.map((m) => ({ ...m, revision: 'main' })) } };
    const fixed = followZmkVersion(pinned, 'zmk-helpers');
    expect(fixed.west.modules.map((m) => m.revision)).toEqual([undefined, 'main']);
  });
});

describe('unicode mode', () => {
  it('defaults to WinCompose and writes an &uc override', () => {
    const config = load();
    expect(getUnicodeMode(config.keymap)).toBe('UC_MODE_WIN_COMPOSE');
    const mac = setUnicodeMode(config.keymap, 'UC_MODE_MACOS');
    expect(getUnicodeMode(mac)).toBe('UC_MODE_MACOS');
    expect(generateKeymap(mac)).toContain('&uc {\n    default-mode = <UC_MODE_MACOS>;\n};');
    expect(importKeymap(generateKeymap(mac)).model).toEqual(mac);
    const linux = setUnicodeMode(mac, 'UC_MODE_LINUX');
    expect(linux.topLevel.filter((i) => i.kind === 'override' && i.node.name === '&uc')).toHaveLength(1);
  });

  it('keeps other &uc settings', () => {
    const keymap = importKeymap('&uc {\n    minimum-length = <4>;\n};\n').model;
    const next = setUnicodeMode(keymap, 'UC_MODE_LINUX');
    expect(generateKeymap(next)).toContain('minimum-length = <4>;\n    default-mode = <UC_MODE_LINUX>;');
  });
});

describe('fixture bindings after removal', () => {
  it('replaces &uc on both keys', () => {
    const { config } = removeModule(load(), 'zmk-unicode');
    expect(config.keymap.layers[0]?.bindings.filter((b) => formatBinding(b) === '&none')).toHaveLength(2);
  });
});

describe('catalog modules with their own revisions', () => {
  const shields = (config: ReturnType<typeof load>) => config.build.include.map((t) => t.shield);

  it('pins nice-view-gem to its release and turns on the status screen', () => {
    const config = addModule(load(), 'nice-view-gem');
    expect(config.west.modules.at(-1)).toEqual({
      name: 'nice-view-gem',
      remote: 'm165437',
      urlBase: 'https://github.com/M165437',
      revision: 'v0.3.0',
    });
    // The Screens tab picks which halves show it.
    expect(shields(config)).toEqual(shields(load()));
    expect(readKconfigValue(config.kconfig, 'CONFIG_ZMK_DISPLAY_STATUS_SCREEN_CUSTOM')).toBe('y');
    expect(moduleVersionMismatches(config)).toEqual([]);
    expect(followZmkVersion(config, 'nice-view-gem')).toEqual(config);
  });

  it('puts the stock screen back when a screen module is removed', () => {
    const config = addModule(load(), 'nice-view-gem');
    const withGem = { ...config, build: { include: config.build.include.map((t) => ({ ...t, shield: t.shield?.replace('nice_view_adapter nice_view', 'nice_view_adapter nice_view_gem') })) } };
    expect(shields(removeModule(withGem, 'nice-view-gem').config)).toEqual(shields(load()));
  });

  it('still warns about a catalog module pinned somewhere else', () => {
    const config = addModule(load(), 'nice-view-gem');
    const moved = { ...config, west: { ...config.west, modules: config.west.modules.map((m) => (m.name === 'nice-view-gem' ? { ...m, revision: 'main' } : m)) } };
    expect(moduleVersionMismatches(moved).map((m) => m.module)).toEqual(['nice-view-gem']);
    expect(followZmkVersion(moved, 'nice-view-gem').west.modules.at(-1)?.revision).toBe('v0.3.0');
  });

  it('keeps an untagged module on its branch across ZMK versions', () => {
    const base = removeModule(load(), 'zmk-unicode').config;
    const config = addModule(base, 'zmk-tri-state');
    expect(config.west.modules.at(-1)?.revision).toBe('main');
    const result = setZmkVersion(config, 'v0.2');
    if (!result.ok) throw new Error('should switch');
    expect(result.config.west.modules.map((m) => m.revision)).toEqual([undefined, 'main']);
    expect(setZmkVersion(addModule(base, 'nice-view-gem'), 'v0.2')).toEqual({ ok: false, blockedBy: ['nice-view-gem'] });
  });

  it('adds and removes a shield per build target', () => {
    const config = addModule(load(), 'zmk-rgbled-widget');
    expect(hasModuleShield(config.build, 'zmk-rgbled-widget', 0)).toBe(false);
    const on = setModuleShield(config, 'zmk-rgbled-widget', 0, true);
    expect(shields(on)[0]).toBe('lily58_left nice_view_adapter nice_view rgbled_adapter');
    expect(hasModuleShield(on.build, 'zmk-rgbled-widget', 0)).toBe(true);
    expect(setModuleShield(on, 'zmk-rgbled-widget', 0, false).build).toEqual(config.build);
    expect(findBehavior(behaviorCatalog(config.keymap), 'ind_bat')?.group).toBe('module');
  });
});

describe('behavior templates', () => {
  it('adds a leader key whose sequences survive a round trip', () => {
    const module = findModule('zmk-leader-key');
    const template = module?.templates?.[0];
    if (!template) throw new Error('missing template');
    const { keymap, label } = addTemplateBehavior(load().keymap, template);
    expect(label).toBe('leader');
    const leader = keymap.behaviors.find((b) => b.label === 'leader');
    expect(leader?.children?.map((c) => c.name)).toEqual(['usb', 'ble', 'boot', 'reset']);
    expect(importKeymap(generateKeymap(keymap)).model).toEqual(keymap);
    expect(findBehavior(behaviorCatalog(keymap), 'leader')?.group).toBe('custom');

    const again = addTemplateBehavior(keymap, template);
    expect(again.label).toBe('leader_2');
  });

  it('reads a behavior from source and explains mistakes', () => {
    const parsed = parseBehaviorSource('sw: swapper {\n compatible = "zmk,behavior-tri-state";\n #binding-cells = <0>;\n bindings = <&kt LALT>, <&kp TAB>, <&kt LALT>;\n};');
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.behavior.bindings.map((b) => b.behavior)).toEqual(['kt', 'kp', 'kt']);
    expect(parseBehaviorSource(behaviorSource(parsed.behavior))).toEqual(parsed);
    expect(parseBehaviorSource('swapper { compatible = "x"; };')).toEqual({ ok: false, error: expect.stringMatching(/label/) });
    expect(parseBehaviorSource('a: a { compatible = "x"; }; b: b { compatible = "x"; };').ok).toBe(false);
  });
});

describe('modules from GitHub', () => {
  it('reads owner/repo from URLs and text', () => {
    expect(parseModuleRepo('https://github.com/badjeff/zmk-behavior-insomnia/')).toEqual({ owner: 'badjeff', repo: 'zmk-behavior-insomnia' });
    expect(parseModuleRepo('github.com/urob/zmk-leader-key.git')).toEqual({ owner: 'urob', repo: 'zmk-leader-key' });
    expect(parseModuleRepo(' urob/zmk-leader-key ')).toEqual({ owner: 'urob', repo: 'zmk-leader-key' });
    expect(parseModuleRepo('https://github.com/urob/zmk-leader-key/tree/main')).toEqual({ owner: 'urob', repo: 'zmk-leader-key' });
    expect(parseModuleRepo('not a repo')).toBeNull();
  });

  it('adds any module to west.yml with its headers', () => {
    const config = addCustomModule(load(), { owner: 'badjeff', repo: 'zmk-behavior-insomnia', revision: 'main', includes: ['behaviors/insomnia.dtsi'] });
    expect(config.west.modules.at(-1)).toEqual({
      name: 'zmk-behavior-insomnia',
      remote: 'badjeff',
      urlBase: 'https://github.com/badjeff',
      revision: 'main',
    });
    expect(includes(config)).toContain('behaviors/insomnia.dtsi');
    const follows = addCustomModule(load(), { owner: 'someone', repo: 'zmk-thing', revision: 'v0.3', includes: [] });
    expect(follows.west.modules.at(-1)?.revision).toBeUndefined();
    expect(() => addCustomModule(config, { owner: 'x', repo: 'zmk-behavior-insomnia', includes: [] })).toThrow(/already/);
    expect(removeModule(config, 'zmk-behavior-insomnia').config.west).toEqual(load().west);
  });
});
