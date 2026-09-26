import { describe, expect, it } from 'vitest';
import { generateKeymap } from '../keymap/generator.ts';
import { layoutKeyCount } from '../layouts/types.ts';
import { physicalLayoutFor, textLayoutFor } from '../layouts/index.ts';
import { buildTargets, controllersFor, findKeyboard, KEYBOARDS, layoutsFor, newConfig } from './keyboards.ts';

const corne = () => {
  const def = findKeyboard('corne');
  if (!def) throw new Error('no corne');
  return def;
};

describe('keyboard catalog', () => {
  it('has the common keyboards with layouts', () => {
    for (const id of ['corne', 'lily58', 'sofle', 'kyria_rev3', 'cradio', 'reviung41']) {
      const def = findKeyboard(id);
      if (!def) throw new Error(`missing ${id}`);
      expect(layoutsFor(def, def.keyCount).length, id).toBeGreaterThan(0);
    }
    expect(KEYBOARDS.length).toBeGreaterThan(60);
  });

  it('finds a keyboard by a half or by its keymap name', () => {
    expect(findKeyboard('corne_left')?.id).toBe('corne');
    expect(findKeyboard('corneish_zen')?.id).toBe('corneish_zen_v2');
  });

  it('offers the layouts that fit a key count', () => {
    expect(layoutsFor(corne(), 42).map((l) => l.name)).toEqual(['6 Column']);
    expect(layoutsFor(corne(), 36).map((l) => l.name)).toEqual(['5 Column']);
  });

  it('lists controllers for pro micro shields, wireless first', () => {
    const controllers = controllersFor(corne());
    expect(controllers[0]?.ble).toBe(true);
    expect(controllers.map((c) => c.id)).toContain('nice_nano_v2');
  });

  it('builds targets for split, single and board keyboards', () => {
    expect(buildTargets(corne(), 'nice_nano_v2', { niceView: true })).toEqual([
      { board: 'nice_nano_v2', shield: 'corne_left nice_view_adapter nice_view' },
      { board: 'nice_nano_v2', shield: 'corne_right nice_view_adapter nice_view' },
    ]);
    const reviung = findKeyboard('reviung41');
    expect(reviung && buildTargets(reviung, 'nice_nano_v2')).toEqual([{ board: 'nice_nano_v2', shield: 'reviung41' }]);
    const planck = findKeyboard('planck_rev6');
    expect(planck && buildTargets(planck, '')).toEqual([{ board: 'planck_rev6' }]);
  });
});

describe('layouts for any keyboard', () => {
  it('picks the physical layout by keyboard name and key count', () => {
    expect(physicalLayoutFor('corne', 42).keys).toHaveLength(42);
    expect(physicalLayoutFor('corne', 36).keys).toHaveLength(36);
    expect(physicalLayoutFor('lily58', 58).keys).toHaveLength(58);
    expect(physicalLayoutFor('unknown', 20).name).toBe('grid');
  });

  it('derives a text layout so generated keymaps are aligned', () => {
    const text = textLayoutFor('corne', 42);
    expect(text && layoutKeyCount(text)).toBe(42);
    expect(text?.rows).toHaveLength(4);
    expect(text?.rows[0]?.filter((k) => k !== null)).toHaveLength(12);
  });
});

describe('newConfig', () => {
  it('builds a config from ZMK’s default keymap and conf', async () => {
    const fetched: string[] = [];
    const fetchText = async (url: string) => {
      fetched.push(url);
      if (url.endsWith('.keymap')) {
        return `#include <behaviors.dtsi>\n#include <dt-bindings/zmk/keys.h>\n/ { keymap { compatible = "zmk,keymap"; base { bindings = <${'&kp A '.repeat(42)}>; }; }; };`;
      }
      return '# conf\nCONFIG_ZMK_SLEEP=y\n';
    };
    const { config, warnings } = await newConfig(corne(), { controller: 'nice_nano_v2', niceView: false, zmkVersion: 'v0.3' }, fetchText);
    expect(fetched).toEqual([
      'https://raw.githubusercontent.com/zmkfirmware/zmk/v0.3/app/boards/shields/corne/corne.keymap',
      'https://raw.githubusercontent.com/zmkfirmware/zmk/v0.3/app/boards/shields/corne/corne.conf',
    ]);
    expect(warnings).toEqual([]);
    expect(config.keyboard).toBe('corne');
    expect(config.keymap.layers[0]?.bindings).toHaveLength(42);
    expect(config.west).toEqual({ zmkVersion: 'v0.3', modules: [], selfPath: 'config' });
    expect(config.build.include).toHaveLength(2);
    expect(config.kconfig.lines).toContainEqual({ kind: 'set', name: 'CONFIG_ZMK_SLEEP', value: 'y' });
    expect(generateKeymap(config.keymap, textLayoutFor('corne', 42))).toContain('&kp A  &kp A');
  });
});
