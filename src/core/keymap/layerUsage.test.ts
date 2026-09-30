import { describe, expect, it } from 'vitest';
import { importKeymap } from './importer.ts';
import { layerReferences, layerWarnings } from './layerUsage.ts';

/** A keymap whose layers have these bindings, with `extra` root nodes and `top` lines before the root. */
function keymap(layers: string[], extra = '', top = '') {
  const body = layers.map((bindings, i) => `l${i} { bindings = <${bindings}>; };`).join('\n');
  return importKeymap(`${top}\n/ {\n${extra}\nkeymap { compatible = "zmk,keymap";\n${body}\n};\n};`).model;
}

const kinds = (model: ReturnType<typeof keymap>) => layerWarnings(model).map((w) => w.kind);

describe('layerReferences', () => {
  it('finds layer keys, with where they are and how they work', () => {
    const refs = layerReferences(
      keymap(['&kp A &mo 1 &lt 2 SPACE &tog 3 &to 4 &sl 5', '&trans', '&trans', '&trans', '&trans', '&trans']),
    );
    expect(refs.map((r) => [r.from, r.to, r.kind, r.behavior])).toEqual([
      [{ kind: 'key', layer: 0, key: 1 }, 1, 'momentary', 'mo'],
      [{ kind: 'key', layer: 0, key: 2 }, 2, 'momentary', 'lt'],
      [{ kind: 'key', layer: 0, key: 3 }, 3, 'toggle', 'tog'],
      [{ kind: 'key', layer: 0, key: 4 }, 4, 'to', 'to'],
      [{ kind: 'key', layer: 0, key: 5 }, 5, 'sticky', 'sl'],
    ]);
  });

  it('resolves #define names', () => {
    const refs = layerReferences(keymap(['&mo NAV', '&trans'], '', '#define NAV 1'));
    expect(refs[0]).toMatchObject({ to: 1, token: 'NAV' });
  });

  it('skips tokens it cannot resolve', () => {
    expect(layerReferences(keymap(['&mo SOMETHING', '&trans']))).toEqual([]);
  });

  it('finds layer behaviors inside tap-dances and macros, on the key that uses them', () => {
    const extra = `behaviors {
      td_nav: td_nav { compatible = "zmk,behavior-tap-dance"; #binding-cells = <0>; bindings = <&kp A>, <&mo 1>; };
    };`;
    const refs = layerReferences(keymap(['&kp A &td_nav', '&trans'], extra));
    expect(refs).toEqual([
      { from: { kind: 'key', layer: 0, key: 1 }, to: 1, token: '1', behavior: 'mo', via: 'td_nav', kind: 'momentary' },
    ]);
  });

  it('finds custom hold-taps with a layer hold, and how their hold works', () => {
    const extra = `behaviors {
      ht: ht { compatible = "zmk,behavior-hold-tap"; #binding-cells = <2>; bindings = <&tog>, <&kp>; };
    };`;
    const refs = layerReferences(keymap(['&ht 1 A', '&trans']));
    expect(refs).toEqual([]);
    expect(layerReferences(keymap(['&ht 1 A', '&trans'], extra))[0]).toMatchObject({ to: 1, behavior: 'ht', kind: 'toggle' });
  });

  it('finds combos, with the layers they work on', () => {
    const extra = `combos { compatible = "zmk,combos";
      a { key-positions = <0 1>; bindings = <&tog 1>; layers = <0>; };
      b { key-positions = <0 1>; bindings = <&mo 1>; };
    };`;
    const refs = layerReferences(keymap(['&kp A &kp B', '&trans &trans'], extra));
    expect(refs.map((r) => r.from)).toEqual([
      { kind: 'combo', name: 'a', layers: [0] },
      { kind: 'combo', name: 'b', layers: 'all' },
    ]);
  });

  it('finds conditional layers', () => {
    const extra = `conditional_layers { compatible = "zmk,conditional-layers"; tri { if-layers = <1 2>; then-layer = <3>; }; };`;
    const refs = layerReferences(keymap(['&mo 1 &mo 2', '&trans &trans', '&trans &trans', '&trans &trans'], extra));
    expect(refs.at(-1)).toMatchObject({
      from: { kind: 'conditional', name: 'tri', ifLayers: [1, 2] },
      to: 3,
      kind: 'conditional',
    });
  });

  it('finds layer behaviors on encoders', () => {
    const extra = `behaviors {
      enc: enc { compatible = "zmk,behavior-sensor-rotate"; #sensor-binding-cells = <0>; bindings = <&tog 1>, <&kp B>; };
    };`;
    const source = `/ {\n${extra}\nkeymap { compatible = "zmk,keymap";
      l0 { bindings = <&kp A>; sensor-bindings = <&enc>; };
      l1 { bindings = <&trans>; };
    };\n};`;
    const refs = layerReferences(importKeymap(source).model);
    expect(refs).toEqual([
      { from: { kind: 'encoder', layer: 0, sensor: 0 }, to: 1, token: '1', behavior: 'tog', via: 'enc', kind: 'toggle' },
    ]);
  });
});

describe('layerWarnings', () => {
  it('has nothing to say about a sound keymap', () => {
    expect(layerWarnings(keymap(['&kp A &mo 1', '&kp B &trans']))).toEqual([]);
  });

  it('warns about a layer nothing turns on', () => {
    expect(layerWarnings(keymap(['&kp A', '&kp B']))).toEqual([{ kind: 'unreachable', layer: 1 }]);
  });

  it('warns about layers only unreachable layers lead to', () => {
    expect(kinds(keymap(['&kp A', '&mo 2', '&kp B']))).toEqual(['unreachable', 'unreachable']);
  });

  it('counts combos that work on a reachable layer, or on every layer', () => {
    const combos = (layers: string) =>
      `combos { compatible = "zmk,combos"; c { key-positions = <0 1>; bindings = <&mo 1>; ${layers} }; };`;
    expect(kinds(keymap(['&kp A &kp B', '&trans &trans'], combos('')))).toEqual([]);
    expect(kinds(keymap(['&kp A &kp B', '&trans &trans'], combos('layers = <0>;')))).toEqual([]);
    expect(kinds(keymap(['&kp A &kp B', '&trans &trans', '&kp C &kp D'], combos('layers = <2>;')))).toEqual([
      'unreachable',
      'unreachable',
    ]);
  });

  it('counts conditional layers when all of their layers can be reached', () => {
    const tri = `conditional_layers { compatible = "zmk,conditional-layers"; tri { if-layers = <1 2>; then-layer = <3>; }; };`;
    expect(kinds(keymap(['&mo 1 &mo 2', '&trans &trans', '&trans &trans', '&kp A &trans'], tri))).toEqual([]);
    expect(layerWarnings(keymap(['&mo 1 &kp A', '&trans &trans', '&trans &trans', '&kp A &trans'], tri))).toEqual([
      { kind: 'unreachable', layer: 2 },
      { kind: 'unreachable', layer: 3 },
    ]);
  });

  it('warns about &to a layer with no way back', () => {
    const model = keymap(['&kp A &to 1', '&kp B &kp C']);
    expect(layerWarnings(model)).toEqual([{ kind: 'no-way-back', layer: 1, entries: [layerReferences(model)[0]] }]);
  });

  it('finds the way back on the layer itself, through &trans, or through a layer held on it', () => {
    expect(kinds(keymap(['&kp A &to 1', '&to 0 &kp C']))).toEqual([]);
    expect(kinds(keymap(['&kp A &tog 1', '&kp B &trans']))).toEqual([]);
    expect(kinds(keymap(['&kp A &to 1', '&mo 2 &kp C', '&to 0 &trans']))).toEqual([]);
    const extra = `behaviors {
      td_back: td_back { compatible = "zmk,behavior-tap-dance"; #binding-cells = <0>; bindings = <&kp A>, <&to 0>; };
    };`;
    expect(kinds(keymap(['&kp A &to 1', '&td_back &kp C'], extra))).toEqual([]);
  });

  it('warns about &tog when the key is covered on the layer it turns on', () => {
    expect(kinds(keymap(['&kp A &tog 1', '&kp B &kp C']))).toEqual(['no-way-back']);
  });

  it('does not count a toggle key on a layer that is only held', () => {
    // Hold 1, tap &tog 2, let go: layer 1 is off, layer 2 falls through to the base layer's &kp B,
    // and layer 2 covers the &mo 1 that would bring the toggle key back.
    expect(kinds(keymap(['&mo 1 &kp B', '&trans &tog 2', '&kp C &trans']))).toEqual(['no-way-back']);
    // Holding 1 again works while layer 2 leaves &mo 1 showing.
    expect(kinds(keymap(['&mo 1 &kp B', '&trans &tog 2', '&trans &trans']))).toEqual([]);
    // A layer that is toggled on stays on, so its toggle key still shows through.
    expect(kinds(keymap(['&tog 1 &kp B', '&trans &tog 2', '&kp C &trans']))).toEqual([]);
  });

  it('counts combos on the layer as a way back', () => {
    const combos = `combos { compatible = "zmk,combos"; back { key-positions = <0 1>; bindings = <&to 0>; layers = <1>; }; };`;
    expect(kinds(keymap(['&kp A &to 1', '&kp B &kp C'], combos))).toEqual([]);
  });

  it('warns about transparent keys on the base layer', () => {
    expect(layerWarnings(keymap(['&kp A &trans &kp B &trans']))).toEqual([{ kind: 'base-trans', keys: [1, 3] }]);
  });

  it('warns about layers that do not exist', () => {
    const combos = `combos { compatible = "zmk,combos"; c { key-positions = <0 1>; bindings = <&kp X>; layers = <0 7>; }; };`;
    expect(layerWarnings(keymap(['&kp A &mo 5', '&trans &trans'], combos))).toEqual([
      { kind: 'missing-layer', token: '5', from: { kind: 'key', layer: 0, key: 1 } },
      { kind: 'missing-layer', token: '7', from: { kind: 'combo', name: 'c', layers: [0, 7] } },
      { kind: 'unreachable', layer: 1 },
    ]);
  });
});
