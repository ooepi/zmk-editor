import { describe, expect, it } from 'vitest';
import { formatBinding, parseBindings } from './bindings.ts';
import { copyBinding, swapBindings } from './edit.ts';
import { importKeymap } from './importer.ts';
import type { Binding, KeymapModel } from './model.ts';
import { applyPaletteItem, behaviorTiles } from './palette.ts';

const b = (source: string): Binding => {
  const [binding] = parseBindings(source.split(' ')) ?? [];
  if (!binding) throw new Error(`bad binding ${source}`);
  return binding;
};

const SOURCE = `
#include <behaviors.dtsi>
/ {
    behaviors {
        hm: hm { compatible = "zmk,behavior-hold-tap"; #binding-cells = <2>; bindings = <&kp>, <&kp>; };
    };
    macros {
        hello: hello { compatible = "zmk,behavior-macro"; #binding-cells = <0>; bindings = <&kp H>; };
    };
    keymap {
        compatible = "zmk,keymap";
        base { display-name = "Base"; bindings = <&kp A &mt LSHIFT S &lt 1 D &mo 1>; };
        nav { display-name = "Nav"; bindings = <&trans &trans &trans &trans>; };
    };
};`;

const load = (): KeymapModel => importKeymap(SOURCE).model;
const key = (token: string) => ({ kind: 'keycode' as const, token });
const place = (current: string, token: string) => formatBinding(applyPaletteItem(b(current), key(token), load()));

describe('applyPaletteItem', () => {
  it('replaces the keycode of a plain key press', () => {
    expect(place('&kp A', 'B')).toBe('&kp B');
    expect(place('&kp A', 'LC(C)')).toBe('&kp LC(C)');
  });

  it('keeps hold-taps and replaces their tap key', () => {
    expect(place('&mt LSHIFT A', 'B')).toBe('&mt LSHIFT B');
    expect(place('&lt 1 A', 'B')).toBe('&lt 1 B');
    expect(place('&hm LCTRL A', 'B')).toBe('&hm LCTRL B');
  });

  it('replaces the key of other keycode behaviors', () => {
    expect(place('&sk LSHIFT', 'B')).toBe('&sk B');
  });

  it('turns keys without a keycode into a key press', () => {
    expect(place('&mo 1', 'B')).toBe('&kp B');
    expect(place('&trans', 'B')).toBe('&kp B');
    expect(place('&bt BT_CLR', 'B')).toBe('&kp B');
    expect(place('&hello', 'B')).toBe('&kp B');
    expect(place('&unknown 3', 'B')).toBe('&kp B');
  });

  it('replaces the whole binding with a behavior tile', () => {
    const next = applyPaletteItem(b('&mt LSHIFT A'), { kind: 'binding', binding: b('&mo 1') }, load());
    expect(formatBinding(next)).toBe('&mo 1');
  });
});

describe('behaviorTiles', () => {
  const tiles = () => behaviorTiles(load()).map((t) => ({ ...t, source: formatBinding(t.binding) }));

  it('makes one tile per layer for layer behaviors', () => {
    const mo = tiles().filter((t) => t.binding.behavior === 'mo');
    expect(mo.map((t) => t.source)).toEqual(['&mo 0', '&mo 1']);
    expect(mo.map((t) => t.label.main)).toEqual(['Base', 'Nav']);
    expect(tiles().find((t) => t.source === '&lt 1 A')?.group).toBe('layers');
  });

  it('makes one tile per option for enum behaviors', () => {
    const bt = tiles().filter((t) => t.binding.behavior === 'bt').map((t) => t.source);
    expect(bt).toContain('&bt BT_SEL 0');
    expect(bt).toContain('&bt BT_SEL 4');
    expect(bt).toContain('&bt BT_CLR');
    expect(tiles().find((t) => t.source === '&bt BT_SEL 1')?.label.main).toBe('BT 2');
  });

  it('includes plain behaviors and the keymap’s own, but not macro or encoder controls', () => {
    const sources = tiles().map((t) => t.source);
    expect(sources).toEqual(expect.arrayContaining(['&trans', '&none', '&caps_word', '&bootloader', '&hello', '&hm A A']));
    expect(sources).not.toContain('&kp A');
    expect(sources.some((s) => s.startsWith('&macro_') || s.startsWith('&inc_dec_kp'))).toBe(false);
  });
});

describe('swapBindings / copyBinding', () => {
  const layer0 = (model: KeymapModel) => model.layers[0]?.bindings.map(formatBinding);

  it('swaps two keys on a layer', () => {
    expect(layer0(swapBindings(load(), 0, 0, 3))).toEqual(['&mo 1', '&mt LSHIFT S', '&lt 1 D', '&kp A']);
  });

  it('copies a key onto another', () => {
    expect(layer0(copyBinding(load(), 0, 1, 0))).toEqual(['&mt LSHIFT S', '&mt LSHIFT S', '&lt 1 D', '&mo 1']);
  });

  it('leaves the model alone when a key is dropped on itself', () => {
    const model = load();
    expect(swapBindings(model, 0, 2, 2)).toBe(model);
    expect(copyBinding(model, 0, 2, 2)).toBe(model);
  });
});
