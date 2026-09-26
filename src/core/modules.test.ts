import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importConfig } from './config.ts';
import { formatBinding } from './keymap/bindings.ts';
import { describeBinding } from './keymap/display.ts';
import {
  addModule,
  followZmkVersion,
  getUnicodeMode,
  installedModules,
  removeModule,
  setUnicodeMode,
  setZmkVersion,
} from './modules.ts';
import { generateKeymap } from './keymap/generator.ts';
import { importKeymap } from './keymap/importer.ts';
import { behaviorCatalog, findBehavior } from './catalog/behaviors.ts';

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
    expect(installedModules(load()).map((m) => m.id)).toEqual(['zmk-helpers', 'zmk-unicode']);
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
