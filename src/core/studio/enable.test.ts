import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateConfig, importConfig, type ZmkConfig } from '../config.ts';
import { setBinding } from '../keymap/edit.ts';
import { disableStudio, enableStudio, hasUnlockKey, spareLayers, studioEnabled, STUDIO_CMAKE_ARG, STUDIO_SNIPPET } from './enable.ts';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, '../../../test/fixtures/lily58', name), 'utf8');
const demoConfig = () =>
  importConfig({
    'config/lily58.keymap': fixture('lily58.keymap'),
    'config/lily58.conf': fixture('lily58.conf'),
    'config/west.yml': fixture('west.yml'),
    'build.yaml': fixture('build.yaml'),
  });

const roundTrip = (config: ZmkConfig) => importConfig(generateConfig(config), config.keyboard).config;

describe('enableStudio', () => {
  it('turns Studio on for the central (left) half only, and adds spare layers', () => {
    const config = enableStudio(demoConfig().config, 2);
    const [left, right] = config.build.include;
    expect(left).toMatchObject({ snippet: STUDIO_SNIPPET, cmakeArgs: STUDIO_CMAKE_ARG });
    expect(right?.snippet).toBeUndefined();
    expect(right?.cmakeArgs).toBeUndefined();
    expect(spareLayers(config)).toBe(2);
    expect(studioEnabled(config)).toBe(true);

    const back = roundTrip(config);
    expect(studioEnabled(back)).toBe(true);
    expect(spareLayers(back)).toBe(2);
    expect(back.keymap.layers.length).toBe(config.keymap.layers.length);
  });

  it('keeps other cmake args, and changing the spare count keeps the rest', () => {
    const start = demoConfig().config;
    const withArgs: ZmkConfig = { ...start, build: { include: start.build.include.map((t, i) => (i === 0 ? { ...t, cmakeArgs: '-DFOO=1' } : t)) } };
    const on = enableStudio(withArgs, 1);
    expect(on.build.include[0]?.cmakeArgs).toBe(`-DFOO=1 ${STUDIO_CMAKE_ARG}`);
    expect(spareLayers(enableStudio(on, 3))).toBe(3);
    expect(spareLayers(enableStudio(on, 0))).toBe(0);
    expect(enableStudio(on, 3).build.include[0]?.cmakeArgs).toBe(`-DFOO=1 ${STUDIO_CMAKE_ARG}`);
  });

  it('uses the only target of a unibody keyboard', () => {
    const start = demoConfig().config;
    const one: ZmkConfig = { ...start, build: { include: [{ board: 'nice_nano_v2', shield: 'reviung41' }] } };
    expect(enableStudio(one, 0).build.include[0]?.snippet).toBe(STUDIO_SNIPPET);
  });
});

describe('disableStudio', () => {
  it('removes what enableStudio added', () => {
    const start = demoConfig().config;
    const off = disableStudio(enableStudio(start, 2));
    expect(off.build).toEqual(start.build);
    expect(off.keymap.reservedLayers ?? []).toEqual([]);
    expect(studioEnabled(off)).toBe(false);
    expect(generateConfig(off)).toEqual(generateConfig(start));
  });
});

describe('hasUnlockKey', () => {
  it('finds &studio_unlock on any layer', () => {
    const { keymap } = demoConfig().config;
    expect(hasUnlockKey(keymap)).toBe(false);
    expect(hasUnlockKey(setBinding(keymap, 1, 0, { behavior: 'studio_unlock', params: [] }))).toBe(true);
  });
});
