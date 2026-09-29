import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importConfig } from './config.ts';
import { findScreen } from './catalog/screens.ts';
import { readKconfigValue } from './files/kconfig.ts';
import { applyHardware, newHardwareConfig } from './hardware/config.ts';
import { setDisplay } from './hardware/displays.ts';
import { testSplit } from './hardware/testFixtures.ts';
import { readScreenOption, screenConflict, screenSlots, setScreen, setScreenEverywhere, setScreenOption } from './screens.ts';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, '../../test/fixtures/lily58', name), 'utf8');
const load = () =>
  importConfig({
    'config/lily58.keymap': fixture('lily58.keymap'),
    'config/lily58.conf': fixture('lily58.conf'),
    'config/west.yml': fixture('west.yml'),
    'build.yaml': fixture('build.yaml'),
  }).config;

const shields = (config: ReturnType<typeof load>) => config.build.include.map((t) => t.shield);
const modules = (config: ReturnType<typeof load>) => config.west.modules.map((m) => m.name);

describe('nice!view screens', () => {
  it('finds a slot per nice!view half, showing the stock screen', () => {
    expect(screenSlots(load()).map((s) => [s.index, s.label, s.screen])).toEqual([
      [0, 'Left', null],
      [1, 'Right', null],
    ]);
  });

  it('puts a screen on one half and adds its module at the pinned commit', () => {
    const config = setScreen(load(), 1, 'luffy-wanted');
    expect(shields(config)).toEqual(['lily58_left nice_view_adapter nice_view', 'lily58_right nice_view_adapter nice_luffy_wanted']);
    expect(config.west.modules.at(-1)).toEqual({
      name: 'nice-luffy-wanted',
      remote: 'whoop-t',
      urlBase: 'https://github.com/whoop-t',
      revision: '5bff523975f87f01812d9df1045bc34a90dfd756',
    });
    expect(readKconfigValue(config.kconfig, 'CONFIG_ZMK_DISPLAY_STATUS_SCREEN_CUSTOM')).toBe('y');
    expect(screenSlots(config).map((s) => s.screen?.id ?? null)).toEqual([null, 'luffy-wanted']);
  });

  it('mixes screens per half and removes a module once no half uses it', () => {
    const mixed = setScreen(setScreen(load(), 0, 'gem'), 1, 'luffy-wanted');
    expect(modules(mixed)).toEqual([...modules(load()), 'nice-view-gem', 'nice-luffy-wanted']);
    const swapped = setScreen(mixed, 1, 'battery');
    expect(modules(swapped)).toEqual([...modules(load()), 'nice-view-gem', 'nice-view-battery']);
    const stock = setScreen(setScreen(swapped, 0, null), 1, null);
    expect(shields(stock)).toEqual(shields(load()));
    expect(modules(stock)).toEqual(modules(load()));
  });

  it('keeps a module used by the other half', () => {
    const both = setScreenEverywhere(load(), 'gem');
    expect(shields(both)).toEqual(['lily58_left nice_view_adapter nice_view_gem', 'lily58_right nice_view_adapter nice_view_gem']);
    expect(modules(setScreen(both, 0, null))).toContain('nice-view-gem');
  });

  it('removes option lines with the module, except ones another screen still has', () => {
    const inverted = findScreen('gem')?.options.find((o) => o.symbol === 'CONFIG_NICE_VIEW_WIDGET_INVERTED');
    const animate = findScreen('gem')?.options.find((o) => o.symbol === 'CONFIG_NICE_VIEW_GEM_ANIMATION');
    if (!inverted || !animate) throw new Error('missing options');
    let config = setScreen(setScreen(load(), 0, 'gem'), 1, 'battery');
    config = setScreenOption(setScreenOption(config, inverted, true), animate, false);
    expect(readScreenOption(config, animate)).toBe(false);
    const noGem = setScreen(config, 0, null);
    expect(readKconfigValue(noGem.kconfig, 'CONFIG_NICE_VIEW_GEM_ANIMATION')).toBeUndefined();
    expect(readKconfigValue(noGem.kconfig, 'CONFIG_NICE_VIEW_WIDGET_INVERTED')).toBe('y');
  });

  it('writes options and removes them when set back to the default', () => {
    const length = findScreen('gem')?.options.find((o) => o.symbol === 'CONFIG_NICE_VIEW_GEM_ANIMATION_MS');
    if (!length) throw new Error('missing option');
    const config = setScreenOption(setScreen(load(), 0, 'gem'), length, 2000);
    expect(readKconfigValue(config.kconfig, 'CONFIG_NICE_VIEW_GEM_ANIMATION_MS')).toBe('2000');
    expect(readScreenOption(config, length)).toBe(2000);
    const back = setScreenOption(config, length, 960);
    expect(readKconfigValue(back.kconfig, 'CONFIG_NICE_VIEW_GEM_ANIMATION_MS')).toBeUndefined();
    expect(readScreenOption(back, length)).toBe(960);
  });

  it('refuses two screens that share internal names, but allows one on both halves', () => {
    const luffy = setScreen(load(), 1, 'luffy-wanted');
    expect(screenConflict(luffy, 0, 'one-punch-ok')).toMatch(/Luffy wanted poster \(Right\)/);
    expect(() => setScreen(luffy, 0, 'one-punch-ok')).toThrow(/share internal names/);
    expect(screenConflict(luffy, 1, 'one-punch-ok')).toBeUndefined();
    const everywhere = setScreenEverywhere(luffy, 'one-punch-ok');
    expect(screenSlots(everywhere).map((s) => s.screen?.id)).toEqual(['one-punch-ok', 'one-punch-ok']);
    expect(modules(everywhere)).not.toContain('nice-luffy-wanted');
  });

  it('tells apart screens sharing the nice_view_custom shield by their module', () => {
    const mario = setScreen(load(), 1, 'mario-animation');
    expect(shields(mario)[1]).toBe('lily58_right nice_view_adapter nice_view_custom');
    expect(screenSlots(mario)[1]?.screen?.id).toBe('mario-animation');
    const urchin = setScreen(mario, 1, 'urchin-animation');
    expect(screenSlots(urchin)[1]?.screen?.id).toBe('urchin-animation');
    expect(modules(urchin)).not.toContain('mario-peripheral-animation');
  });

  it('shows nice!epaper through the nice!oled module', () => {
    const config = setScreen(load(), 0, 'nice-epaper');
    expect(shields(config)[0]).toBe('lily58_left nice_view_adapter nice_epaper');
    expect(config.west.modules.at(-1)?.name).toBe('zmk-nice-oled');
    expect(modules(setScreen(config, 0, null))).not.toContain('zmk-nice-oled');
  });

  it('refuses a screen on a ZMK version it has no release for', () => {
    const old = { ...load(), west: { ...load().west, zmkVersion: 'v0.2' } };
    expect(() => setScreen(old, 0, 'gem')).toThrow(/no release for ZMK v0.2/);
  });

  it('keeps the chosen screen when a designed keyboard’s hardware changes', () => {
    const hw = setDisplay(setDisplay(testSplit, 'left', 'nice_view'), 'right', 'nice_view');
    const config = setScreen(newHardwareConfig(hw, 'v0.3'), 1, 'battery');
    const moved = applyHardware(config, { ...hw, controller: 'puchi_ble_v1' }, hw.keys.map((_, i) => i)).config;
    expect(shields(moved)[1]).toBe('test_split_right nice_view_adapter nice_view_battery');
    // Taking the nice!view off drops the screen too.
    const off = applyHardware(config, setDisplay(hw, 'right', undefined), hw.keys.map((_, i) => i)).config;
    expect(shields(off)[1]).toBe('test_split_right');
  });
});
