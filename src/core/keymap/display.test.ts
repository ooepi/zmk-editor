import { describe, expect, it } from 'vitest';
import { importKeymap } from './importer.ts';
import { describeBinding } from './display.ts';
import { parseBindings } from './bindings.ts';

const { model } = importKeymap(`
#define NAV 1
/ {
    behaviors {
        hm: homerow_mods {
            compatible = "zmk,behavior-hold-tap";
            #binding-cells = <2>;
            bindings = <&kp>, <&kp>;
        };
        cm: comma_morph {
            compatible = "zmk,behavior-mod-morph";
            #binding-cells = <0>;
            bindings = <&kp COMMA>, <&kp SEMI>;
            mods = <(MOD_LSFT|MOD_RSFT)>;
        };
    };
    macros {
        hello: hello { compatible = "zmk,behavior-macro"; #binding-cells = <0>; bindings = <&kp H>; };
    };
    keymap {
        compatible = "zmk,keymap";
        base { display-name = "Base"; bindings = <&trans>; };
        nav { display-name = "Nav"; bindings = <&trans>; };
    };
};`);

const describe1 = (source: string) => {
  const [binding] = parseBindings(source.split(' ')) ?? [];
  if (!binding) throw new Error('bad binding');
  return describeBinding(binding, model);
};

describe('describeBinding', () => {
  it('describes key presses with modifiers', () => {
    expect(describe1('&kp A')).toEqual({ main: 'A', kind: 'key' });
    expect(describe1('&kp LG(PG_UP)')).toEqual({ main: 'Gui+PgUp', kind: 'key' });
  });

  it('describes transparent and none', () => {
    expect(describe1('&trans')).toEqual({ main: '▽', kind: 'trans' });
    expect(describe1('&none')).toEqual({ main: '✕', kind: 'none' });
  });

  it('shows hold labels for mod-tap, layer-tap and custom hold-taps', () => {
    expect(describe1('&mt LSHFT A')).toEqual({ main: 'A', sub: 'Shift', kind: 'hold-tap' });
    expect(describe1('&lt 1 SPACE')).toEqual({ main: 'Space', sub: 'Nav', kind: 'hold-tap' });
    expect(describe1('&hm LCTRL S')).toEqual({ main: 'S', sub: 'Ctrl', kind: 'hold-tap' });
  });

  it('names layers, also through #defines', () => {
    expect(describe1('&mo 1')).toEqual({ main: 'Nav', sub: 'mo', kind: 'layer' });
    expect(describe1('&tog NAV')).toEqual({ main: 'Nav', sub: 'tog', kind: 'layer' });
    expect(describe1('&mo 7')).toEqual({ main: '7', sub: 'mo', kind: 'layer' });
  });

  it('describes enum behaviors', () => {
    expect(describe1('&bt BT_SEL 0')).toEqual({ main: 'BT 1', sub: 'bt', kind: 'other' });
    expect(describe1('&mkp MB1')).toEqual({ main: 'LClick', sub: 'mouse', kind: 'other' });
  });

  it('describes mod-morphs, macros and unknown behaviors', () => {
    expect(describe1('&cm')).toEqual({ main: ',', sub: ';', kind: 'mod-morph' });
    expect(describe1('&hello')).toEqual({ main: 'hello', sub: 'macro', kind: 'macro' });
    expect(describe1('&uc UC_SV_OE')).toEqual({ main: 'UC_SV_OE', sub: 'uc', kind: 'other' });
  });
});
