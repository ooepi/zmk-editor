import { describe, expect, it } from 'vitest';
import { formatBinding } from './bindings.ts';
import { describeSensorBinding } from './display.ts';
import { importKeymap } from './importer.ts';
import { generateKeymap } from './generator.ts';
import type { Binding, KeymapModel } from './model.ts';
import { emptyKeymap } from './model.ts';
import { sensorBindingsForZmk, sensorCount, sensorGaps, setSensorBinding } from './sensorEdit.ts';

const load = () =>
  importKeymap(`
/ {
    behaviors {
        scroll: scroll {
            compatible = "zmk,behavior-sensor-rotate";
            #sensor-binding-cells = <0>;
            bindings = <&msc SCRL_DOWN>, <&msc SCRL_UP>;
        };
    };
    keymap {
        compatible = "zmk,keymap";
        a { bindings = <&kp A>; sensor-bindings = <&inc_dec_kp C_VOL_UP C_VOL_DN>; };
        b { bindings = <&kp B>; };
    };
};`).model;

describe('sensors', () => {
  it('counts encoders from the layers', () => {
    expect(sensorCount(load())).toBe(1);
  });

  it('sets a binding and leaves other layers falling through', () => {
    const next = setSensorBinding(load(), 1, 0, { behavior: 'scroll', params: [] });
    expect(next.layers[1]?.sensorBindings?.map(formatBinding)).toEqual(['&scroll']);
    const second = setSensorBinding(load(), 0, 1, { behavior: 'inc_dec_kp', params: ['PG_UP', 'PG_DN'] });
    expect(second.layers[0]?.sensorBindings?.map(formatBinding)).toEqual([
      '&inc_dec_kp C_VOL_UP C_VOL_DN',
      '&inc_dec_kp PG_UP PG_DN',
    ]);
    // ZMK can't list &trans for an encoder; a layer without encoder bindings falls through instead.
    expect(second.layers[1]?.sensorBindings).toBeUndefined();
    // Making an encoder transparent drops it (and any fall-through entries after it) from that layer.
    const cleared = setSensorBinding(next, 1, 0, { behavior: 'trans', params: [] });
    expect(cleared.layers[1]?.sensorBindings).toBeUndefined();
  });

  it('describes both directions', () => {
    const model = load();
    expect(describeSensorBinding({ behavior: 'inc_dec_kp', params: ['C_VOL_UP', 'C_VOL_DN'] }, model)).toEqual({
      cw: 'Vol+',
      ccw: 'Vol-',
    });
    expect(describeSensorBinding({ behavior: 'scroll', params: [] }, model)).toEqual({ cw: 'Wh ↓', ccw: 'Wh ↑', name: 'scroll' });
    expect(describeSensorBinding({ behavior: 'trans', params: [] }, model)).toEqual({ cw: '▽', ccw: '▽' });
  });
});

describe('encoder bindings as ZMK needs them', () => {
  // ZMK v0.3's &trans and &none have no #sensor-binding-cells, so neither may appear in
  // sensor-bindings; a layer without the property (or a shorter list) falls through instead.
  const vol: Binding = { behavior: 'inc_dec_kp', params: ['C_VOL_UP', 'C_VOL_DN'] };
  const pg: Binding = { behavior: 'inc_dec_kp', params: ['PG_UP', 'PG_DN'] };
  const trans: Binding = { behavior: 'trans', params: [] };
  const none: Binding = { behavior: 'none', params: [] };
  const model = (...lists: (Binding[] | undefined)[]): KeymapModel => ({
    ...emptyKeymap(),
    layers: lists.map((sensorBindings, i) => ({ name: `l${i}`, bindings: [], properties: [], ...(sensorBindings ? { sensorBindings } : {}) })),
  });

  it('leaves out layers whose encoders all fall through, and trailing transparent entries', () => {
    expect(sensorBindingsForZmk(model([vol, pg], [trans, trans], [none]))).toEqual([[vol, pg], undefined, undefined]);
    expect(sensorBindingsForZmk(model([vol, pg], [pg, trans]))).toEqual([[vol, pg], [pg]]);
  });

  it('fills a transparent gap before a real binding with what the layer below does', () => {
    expect(sensorBindingsForZmk(model([vol, pg], undefined, [trans, vol]))).toEqual([[vol, pg], undefined, [vol, vol]]);
    expect(sensorGaps(model([vol, pg], [trans, vol]))).toEqual([]);
  });

  it('reports a gap nothing below can fill', () => {
    expect(sensorGaps(model([trans, pg]))).toEqual([
      'Encoder 1 has no binding on layer l0, but encoder 2 after it does; ZMK can’t leave that gap. Give encoder 1 a binding there.',
    ]);
  });

  it('never writes &trans or &none into sensor-bindings', () => {
    const text = generateKeymap(model([vol, pg], [trans, trans], [trans, vol], [none, none]));
    expect(text).not.toMatch(/sensor-bindings = <[^>]*&(trans|none)/);
    expect(text.match(/sensor-bindings/g)).toHaveLength(2);
  });
});

