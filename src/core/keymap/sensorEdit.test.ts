import { describe, expect, it } from 'vitest';
import { formatBinding } from './bindings.ts';
import { describeSensorBinding } from './display.ts';
import { importKeymap } from './importer.ts';
import { sensorCount, setSensorBinding } from './sensorEdit.ts';

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

  it('sets a binding and fills layers without one with &trans', () => {
    const next = setSensorBinding(load(), 1, 0, { behavior: 'scroll', params: [] });
    expect(next.layers[1]?.sensorBindings?.map(formatBinding)).toEqual(['&scroll']);
    const second = setSensorBinding(load(), 0, 1, { behavior: 'inc_dec_kp', params: ['PG_UP', 'PG_DN'] });
    expect(second.layers[0]?.sensorBindings?.map(formatBinding)).toEqual([
      '&inc_dec_kp C_VOL_UP C_VOL_DN',
      '&inc_dec_kp PG_UP PG_DN',
    ]);
    expect(second.layers[1]?.sensorBindings?.map(formatBinding)).toEqual(['&trans', '&trans']);
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
