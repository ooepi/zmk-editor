import { describe, expect, it } from 'vitest';
import { formatBinding, parseBindings } from './bindings.ts';
import { importKeymap } from './importer.ts';
import { generateKeymap } from './generator.ts';
import { behaviorKind } from './model.ts';
import type { TextLayout } from '../layouts/types.ts';

describe('bindings', () => {
  it('splits cell tokens into bindings at each &reference', () => {
    expect(parseBindings(['&kp', 'A', '&bt', 'BT_SEL', '0', '&trans'])).toEqual([
      { behavior: 'kp', params: ['A'] },
      { behavior: 'bt', params: ['BT_SEL', '0'] },
      { behavior: 'trans', params: [] },
    ]);
  });

  it('rejects tokens before the first reference', () => {
    expect(parseBindings(['0', '&kp', 'A'])).toBeNull();
  });

  it('formats a binding back to source', () => {
    expect(formatBinding({ behavior: 'kp', params: ['LG(PG_UP)'] })).toBe('&kp LG(PG_UP)');
  });
});

const SAMPLE = `
#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
#define NAV 1

&mt { tapping-term-ms = <200>; };

/ {
    behaviors {
        hm: homerow_mods {
            compatible = "zmk,behavior-hold-tap";
            #binding-cells = <2>;
            flavor = "balanced";
            bindings = <&kp>, <&kp>;
        };
    };

    macros {
        hello: hello {
            compatible = "zmk,behavior-macro";
            #binding-cells = <0>;
            bindings = <&macro_tap &kp H &kp I>;
        };
    };

    combos {
        compatible = "zmk,combos";
        esc {
            timeout-ms = <50>;
            key-positions = <0 1>;
            bindings = <&kp ESC>;
            layers = <0 NAV>;
        };
    };

    conditional_layers {
        compatible = "zmk,conditional-layers";
        tri { if-layers = <1 2>; then-layer = <3>; };
    };

    keymap {
        compatible = "zmk,keymap";
        base_layer: base {
            display-name = "BASE";
            bindings = <&hm LSHFT A &kp B &mo NAV &hello>;
            sensor-bindings = <&inc_dec_kp C_VOL_UP C_VOL_DN>;
        };
        nav {
            bindings = <&trans &trans &trans &trans>;
        };
    };
};
`;

describe('importKeymap', () => {
  const { model, warnings } = importKeymap(SAMPLE);

  it('keeps top-level items in order', () => {
    expect(model.topLevel.map((i) => i.kind)).toEqual(['include', 'include', 'define', 'override']);
  });

  it('reads behaviors and macros with their kind', () => {
    expect(model.behaviors).toEqual([
      {
        name: 'homerow_mods',
        label: 'hm',
        compatible: 'zmk,behavior-hold-tap',
        bindings: [
          { behavior: 'kp', params: [] },
          { behavior: 'kp', params: [] },
        ],
        properties: [
          { name: '#binding-cells', values: [{ kind: 'cells', tokens: ['2'] }] },
          { name: 'flavor', values: [{ kind: 'string', value: 'balanced' }] },
        ],
      },
      {
        name: 'hello',
        label: 'hello',
        compatible: 'zmk,behavior-macro',
        bindings: [
          { behavior: 'macro_tap', params: [] },
          { behavior: 'kp', params: ['H'] },
          { behavior: 'kp', params: ['I'] },
        ],
        properties: [{ name: '#binding-cells', values: [{ kind: 'cells', tokens: ['0'] }] }],
      },
    ]);
    expect(model.behaviors.map(behaviorKind)).toEqual(['hold-tap', 'macro']);
  });

  it('reads combos', () => {
    expect(model.combos).toEqual([
      {
        name: 'esc',
        keyPositions: ['0', '1'],
        binding: { behavior: 'kp', params: ['ESC'] },
        layers: ['0', 'NAV'],
        properties: [{ name: 'timeout-ms', values: [{ kind: 'cells', tokens: ['50'] }] }],
      },
    ]);
  });

  it('reads layers with sensor bindings', () => {
    expect(model.layers).toEqual([
      {
        name: 'base',
        label: 'base_layer',
        displayName: 'BASE',
        bindings: [
          { behavior: 'hm', params: ['LSHFT', 'A'] },
          { behavior: 'kp', params: ['B'] },
          { behavior: 'mo', params: ['NAV'] },
          { behavior: 'hello', params: [] },
        ],
        sensorBindings: [{ behavior: 'inc_dec_kp', params: ['C_VOL_UP', 'C_VOL_DN'] }],
        properties: [],
      },
      {
        name: 'nav',
        bindings: Array.from({ length: 4 }, () => ({ behavior: 'trans', params: [] })),
        properties: [],
      },
    ]);
  });

  it('keeps unmodeled root children as extra nodes', () => {
    expect(model.extraNodes.map((n) => n.name)).toEqual(['conditional_layers']);
    expect(warnings).toEqual([]);
  });

  it('round-trips through the generator', () => {
    const text = generateKeymap(model);
    const again = importKeymap(text);
    expect(again.model).toEqual(model);
    expect(again.warnings).toEqual([]);
    expect(generateKeymap(again.model)).toBe(text);
  });

  it('warns about raw items the importer could not model', () => {
    const result = importKeymap('ZMK_COMBO(esc, &kp ESC, 0 1, 0)\n');
    expect(result.model.topLevel).toEqual([{ kind: 'raw', text: 'ZMK_COMBO(esc, &kp ESC, 0 1, 0)' }]);
    expect(result.warnings).toHaveLength(1);
  });

  it('keeps a combo with an unusual binding count as an extra node', () => {
    const result = importKeymap('/ { combos { compatible = "zmk,combos"; c { key-positions = <0 1>; bindings = <&kp A &kp B>; }; }; };');
    expect(result.model.combos).toEqual([]);
    expect(result.model.extraNodes).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(importKeymap(generateKeymap(result.model)).model).toEqual(result.model);
  });
});

describe('generateKeymap', () => {
  const layout: TextLayout = {
    name: 'mini',
    rows: [
      [0, 1, null, 2],
      [null, 3, 4, null],
    ],
  };

  it('aligns bindings on the layout grid and adds an ASCII layer comment', () => {
    const { model } = importKeymap(`
/ {
    keymap {
        compatible = "zmk,keymap";
        base {
            display-name = "BASE";
            bindings = <&kp ESC &kp N1 &kp Q &mo 1 &trans>;
        };
        fn {
            display-name = "FN";
            bindings = <&kp F1 &kp F2 &kp F3 &trans &kp SPACE>;
        };
    };
};`);
    const text = generateKeymap(model, layout);
    expect(text).toContain(
      [
        '        base {',
        '            display-name = "BASE";',
        '            // | ESC | 1  |   | Q |',
        '            //       | FN |   |',
        '            bindings = <',
        '                &kp ESC  &kp N1          &kp Q',
        '                         &mo 1   &trans',
        '            >;',
        '        };',
      ].join('\n'),
    );
    expect(importKeymap(text).model).toEqual(model);
  });

  it('falls back to rows of 12 when the layout does not match', () => {
    const { model } = importKeymap(
      `/ { keymap { compatible = "zmk,keymap"; l { bindings = <${'&kp A '.repeat(13)}>; }; }; };`,
    );
    const text = generateKeymap(model, layout);
    expect(text).toContain(`                ${'&kp A  '.repeat(11)}&kp A\n                &kp A\n`);
  });
});
