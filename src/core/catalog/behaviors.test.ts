import { describe, expect, it } from 'vitest';
import { importKeymap } from '../keymap/importer.ts';
import { behaviorCatalog, BUILTIN_BEHAVIORS, findBehavior, searchBehaviors } from './behaviors.ts';

const { model } = importKeymap(`
/ {
    behaviors {
        hm: homerow_mods {
            compatible = "zmk,behavior-hold-tap";
            #binding-cells = <2>;
            bindings = <&kp>, <&kp>;
        };
        lth: layer_tap_hold {
            compatible = "zmk,behavior-hold-tap";
            #binding-cells = <2>;
            bindings = <&mo>, <&kp>;
        };
        cm: comma_morph {
            compatible = "zmk,behavior-mod-morph";
            #binding-cells = <0>;
            bindings = <&kp COMMA>, <&kp SEMI>;
            mods = <(MOD_LSFT|MOD_RSFT)>;
        };
        scroll: scroll {
            compatible = "zmk,behavior-sensor-rotate";
            #sensor-binding-cells = <0>;
            bindings = <&msc SCRL_DOWN>, <&msc SCRL_UP>;
        };
    };
    macros {
        m2: m2 {
            compatible = "zmk,behavior-macro-two-param";
            #binding-cells = <2>;
            bindings = <&macro_tap>;
        };
    };
};`);

describe('behaviorCatalog', () => {
  const catalog = behaviorCatalog(model);

  it('lists built-ins with typed params', () => {
    expect(findBehavior(catalog, 'kp')?.params).toEqual([{ kind: 'keycode' }]);
    expect(findBehavior(catalog, 'lt')?.params).toEqual([{ kind: 'layer' }, { kind: 'keycode' }]);
    expect(findBehavior(catalog, 'trans')?.params).toEqual([]);
    const bt = findBehavior(catalog, 'bt')?.params[0];
    expect(bt?.kind === 'enum' && bt.options.find((o) => o.value === 'BT_SEL')?.number).toBeDefined();
  });

  it('types hold-tap params from their bindings', () => {
    expect(findBehavior(catalog, 'hm')).toMatchObject({
      name: 'hm',
      group: 'custom',
      params: [{ kind: 'keycode' }, { kind: 'keycode' }],
      holdParam: 0,
    });
    expect(findBehavior(catalog, 'lth')?.params).toEqual([{ kind: 'layer' }, { kind: 'keycode' }]);
  });

  it('gives other custom behaviors raw params from #binding-cells', () => {
    expect(findBehavior(catalog, 'cm')?.params).toEqual([]);
    expect(findBehavior(catalog, 'm2')?.params).toEqual([{ kind: 'raw' }, { kind: 'raw' }]);
  });

  it('puts encoder behaviors in the sensor group', () => {
    expect(findBehavior(catalog, 'scroll')).toMatchObject({ group: 'sensor', params: [] });
    expect(findBehavior(catalog, 'inc_dec_kp')?.group).toBe('sensor');
    expect(findBehavior(catalog, 'nope')).toBeUndefined();
  });

  it('has the macro controls', () => {
    expect(findBehavior(catalog, 'macro_wait_time')).toMatchObject({ group: 'macro', params: [{ kind: 'number' }] });
  });
});

describe('searchBehaviors', () => {
  const refs = (query: string) => searchBehaviors(BUILTIN_BEHAVIORS, query).map((d) => d.ref);

  it('puts exact and prefix matches of the ref or name first', () => {
    expect(refs('lt')[0]).toBe('lt');
    expect(refs('mo')[0]).toBe('mo');
    expect(refs('mod')[0]).toBe('mt');
    expect(refs('tap')).toEqual(expect.arrayContaining(['mt', 'lt', 'macro_tap']));
  });

  it('finds behaviors by description and group', () => {
    expect(refs('blue')).toEqual(expect.arrayContaining(['bt', 'out']));
    expect(refs('flashing')).toEqual(['bootloader']);
  });

  it('keeps catalog order for an empty query', () => {
    expect(refs('')).toEqual(BUILTIN_BEHAVIORS.map((d) => d.ref));
  });
});
