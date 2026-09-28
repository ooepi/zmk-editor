import { describe, expect, it } from 'vitest';
import { comboRows } from './cheatsheet.ts';
import { importKeymap } from './importer.ts';

const SOURCE = `
#include <behaviors.dtsi>
#define JK 2
/ {
    combos {
        compatible = "zmk,combos";
        esc { key-positions = <0 1>; bindings = <&kp ESC>; };
        tab { key-positions = <JK 3>; bindings = <&kp TAB>; layers = <1>; };
    };
    keymap {
        compatible = "zmk,keymap";
        base { display-name = "Base"; bindings = <&kp A &kp B &mt LSHIFT J &kp K>; };
        nav { display-name = "Nav"; bindings = <&trans &trans &trans &trans>; };
    };
};`;

describe('comboRows', () => {
  it('names combo keys by what they do on the base layer', () => {
    expect(comboRows(importKeymap(SOURCE).model)).toEqual([
      { name: 'esc', keys: ['A', 'B'], sends: 'Esc', layers: 'All layers' },
      { name: 'tab', keys: ['J', 'K'], sends: 'Tab', layers: 'Nav' },
    ]);
  });

  it('keeps positions it cannot resolve', () => {
    const model = importKeymap(SOURCE).model;
    const combo = model.combos[0];
    if (!combo) throw new Error('no combo');
    const odd = { ...model, combos: [{ ...combo, keyPositions: ['0', 'NOPE', '9'] }] };
    expect(comboRows(odd)[0]?.keys).toEqual(['A', 'NOPE', 'Key 9']);
  });
});
