import { describe, expect, it } from 'vitest';
import { formatBinding, parseBindings } from './bindings.ts';
import { addLayer, changeBehavior, deleteLayer, moveLayer, renameLayer, setBinding } from './edit.ts';
import { generateKeymap } from './generator.ts';
import { importKeymap } from './importer.ts';
import type { Binding, KeymapModel } from './model.ts';

const b = (source: string): Binding => {
  const [binding] = parseBindings(source.split(' ')) ?? [];
  if (!binding) throw new Error(`bad binding ${source}`);
  return binding;
};

const SOURCE = `
#include <behaviors.dtsi>
#define NAV 1
/ {
    macros {
        m: m { compatible = "zmk,behavior-macro"; #binding-cells = <0>; bindings = <&mo 2>; };
    };
    combos {
        compatible = "zmk,combos";
        a { key-positions = <0 1>; bindings = <&kp ESC>; layers = <2>; };
        b { key-positions = <0 1>; bindings = <&kp TAB>; layers = <0 2>; };
    };
    conditional_layers {
        compatible = "zmk,conditional-layers";
        tri { if-layers = <1 2>; then-layer = <3>; };
    };
    keymap {
        compatible = "zmk,keymap";
        base { display-name = "Base"; bindings = <&mo NAV &mo 2 &lt 3 SPACE &kp A>; sensor-bindings = <&tog 2>; };
        nav { display-name = "Nav"; bindings = <&trans &trans &trans &trans>; };
        sym { display-name = "Sym"; bindings = <&to 0 &trans &trans &trans>; };
        adj { display-name = "Adj"; bindings = <&trans &trans &trans &trans>; };
    };
};`;

const load = (): KeymapModel => importKeymap(SOURCE).model;
const layerBindings = (model: KeymapModel, index: number) => model.layers[index]?.bindings.map(formatBinding);

describe('setBinding', () => {
  it('replaces one binding without touching the original model', () => {
    const model = load();
    const next = setBinding(model, 0, 3, b('&kp B'));
    expect(layerBindings(next, 0)?.[3]).toBe('&kp B');
    expect(layerBindings(model, 0)?.[3]).toBe('&kp A');
  });

  it('adds the include a built-in behavior needs', () => {
    const next = setBinding(load(), 0, 3, b('&bt BT_CLR'));
    expect(next.topLevel).toContainEqual({ kind: 'include', path: 'dt-bindings/zmk/bt.h', system: true });
    const again = setBinding(next, 0, 2, b('&bt BT_NXT'));
    expect(again.topLevel.filter((i) => i.kind === 'include')).toHaveLength(2);
  });
});

describe('changeBehavior', () => {
  it('keeps compatible params and fills defaults', () => {
    const model = load();
    expect(formatBinding(changeBehavior(b('&kp A'), 'mt', model))).toBe('&mt LSHIFT A');
    expect(formatBinding(changeBehavior(b('&kp A'), 'lt', model))).toBe('&lt 1 A');
    expect(formatBinding(changeBehavior(b('&lt 2 A'), 'mo', model))).toBe('&mo 2');
    expect(formatBinding(changeBehavior(b('&mo 2'), 'kp', model))).toBe('&kp A');
    expect(formatBinding(changeBehavior(b('&kp A'), 'bt', model))).toBe('&bt BT_SEL 0');
    expect(formatBinding(changeBehavior(b('&kp A'), 'trans', model))).toBe('&trans');
  });
});

describe('layers', () => {
  it('adds a transparent layer with a unique node name', () => {
    const next = addLayer(load(), 'Nav');
    expect(next.layers).toHaveLength(5);
    expect(next.layers[4]).toMatchObject({ name: 'nav_2', displayName: 'Nav' });
    expect(layerBindings(next, 4)).toEqual(['&trans', '&trans', '&trans', '&trans']);
    // Encoders fall through on a new layer: ZMK can't list &trans in sensor-bindings.
    expect(next.layers[4]?.sensorBindings).toBeUndefined();
  });

  it('renames a layer and its node name', () => {
    const next = renameLayer(load(), 2, 'Symbols & Num');
    expect(next.layers[2]).toMatchObject({ name: 'symbols_num', displayName: 'Symbols & Num' });
  });

  it('moves a layer and renumbers every reference', () => {
    // Order before: base nav sym adj → after moving sym to the front: sym base nav adj.
    const next = moveLayer(load(), 2, 0);
    expect(next.layers.map((l) => l.displayName)).toEqual(['Sym', 'Base', 'Nav', 'Adj']);
    expect(layerBindings(next, 1)).toEqual(['&mo NAV', '&mo 0', '&lt 3 SPACE', '&kp A']);
    expect(next.layers[1]?.sensorBindings?.map(formatBinding)).toEqual(['&tog 0']);
    expect(layerBindings(next, 0)?.[0]).toBe('&to 1');
    expect(next.topLevel).toContainEqual({ kind: 'define', name: 'NAV', value: '2' });
    expect(next.behaviors[0]?.bindings.map(formatBinding)).toEqual(['&mo 0']);
    expect(next.combos.map((c) => c.layers)).toEqual([['0'], ['1', '0']]);
    const tri = next.extraNodes.find((n) => n.name === 'conditional_layers')?.children[0];
    expect(tri?.properties.map((p) => p.values)).toEqual([
      [{ kind: 'cells', tokens: ['2', '0'] }],
      [{ kind: 'cells', tokens: ['3'] }],
    ]);
  });

  it('deletes a layer, replacing references to it', () => {
    const { model, removedCombos } = deleteLayer(load(), 2);
    expect(model.layers.map((l) => l.displayName)).toEqual(['Base', 'Nav', 'Adj']);
    expect(layerBindings(model, 0)).toEqual(['&mo NAV', '&none', '&lt 2 SPACE', '&kp A']);
    expect(model.layers[0]?.sensorBindings?.map(formatBinding)).toEqual(['&none']);
    expect(model.combos.map((c) => c.name)).toEqual(['b']);
    expect(model.combos[0]?.layers).toEqual(['0']);
    expect(removedCombos).toEqual(['a']);
  });

  it('turns a layer-tap to a deleted layer into its tap key', () => {
    const { model } = deleteLayer(load(), 3);
    expect(layerBindings(model, 0)?.[2]).toBe('&kp SPACE');
  });

  it('refuses to delete the last layer', () => {
    let model = load();
    for (let i = 0; i < 3; i++) model = deleteLayer(model, 0).model;
    expect(() => deleteLayer(model, 0)).toThrow(/last layer/);
  });

  it('keeps the model generatable after edits', () => {
    const next = deleteLayer(moveLayer(addLayer(load(), 'Extra'), 4, 1), 2).model;
    expect(importKeymap(generateKeymap(next)).model).toEqual(next);
  });
});
