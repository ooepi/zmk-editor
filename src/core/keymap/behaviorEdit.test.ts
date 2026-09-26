import { describe, expect, it } from 'vitest';
import { formatBinding } from './bindings.ts';
import { createBehavior, deleteBehavior, renameBehavior, replaceBehavior, validLabel } from './behaviorEdit.ts';
import { generateKeymap } from './generator.ts';
import { importKeymap } from './importer.ts';

const load = () =>
  importKeymap(`
/ {
    behaviors {
        hm: homerow_mods {
            compatible = "zmk,behavior-hold-tap";
            #binding-cells = <2>;
            bindings = <&kp>, <&kp>;
        };
        cm: cm {
            compatible = "zmk,behavior-mod-morph";
            #binding-cells = <0>;
            bindings = <&hm LCTRL A>, <&kp B>;
            mods = <(MOD_LSFT)>;
        };
    };
    combos {
        compatible = "zmk,combos";
        c { key-positions = <0 1>; bindings = <&hm LSHFT C>; };
    };
    keymap {
        compatible = "zmk,keymap";
        base { bindings = <&hm LSHFT A &cm &kp C>; sensor-bindings = <&cm>; };
    };
};`).model;

describe('createBehavior', () => {
  it('creates each kind with defaults and a unique label', () => {
    const model = load();
    const holdTap = createBehavior(model, 'hold-tap');
    expect(holdTap.label).toBe('ht');
    expect(generateKeymap({ ...model, behaviors: [holdTap] })).toContain(
      [
        '        ht: ht {',
        '            compatible = "zmk,behavior-hold-tap";',
        '            #binding-cells = <2>;',
        '            flavor = "balanced";',
        '            tapping-term-ms = <200>;',
        '            bindings = <&kp>, <&kp>;',
        '        };',
      ].join('\n'),
    );
    const withOne = { ...model, behaviors: [...model.behaviors, holdTap] };
    expect(createBehavior(withOne, 'hold-tap').label).toBe('ht_2');
    expect(createBehavior(model, 'mod-morph').compatible).toBe('zmk,behavior-mod-morph');
    expect(createBehavior(model, 'sensor-rotate').properties).toEqual([
      { name: '#sensor-binding-cells', values: [{ kind: 'cells', tokens: ['0'] }] },
    ]);
    expect(createBehavior(model, 'macro').bindings.map(formatBinding)).toEqual(['&macro_tap', '&kp H', '&kp I']);
  });
});

describe('validLabel', () => {
  it('rejects bad names, built-ins and duplicates', () => {
    const model = load();
    expect(validLabel(model, 'my_ht')).toBeNull();
    expect(validLabel(model, '1abc')).toMatch(/letter/);
    expect(validLabel(model, 'kp')).toMatch(/built-in/);
    expect(validLabel(model, 'cm')).toMatch(/already/);
    expect(validLabel(model, 'cm', 'cm')).toBeNull();
  });
});

describe('renameBehavior', () => {
  it('renames the label and node and updates every reference', () => {
    const next = renameBehavior(load(), 'hm', 'home');
    expect(next.behaviors[0]).toMatchObject({ label: 'home', name: 'homerow_mods' });
    expect(next.layers[0]?.bindings.map(formatBinding)).toEqual(['&home LSHFT A', '&cm', '&kp C']);
    expect(next.behaviors[1]?.bindings.map(formatBinding)).toEqual(['&home LCTRL A', '&kp B']);
    expect(next.combos.map((c) => formatBinding(c.binding))).toEqual(['&home LSHFT C']);

    const renamedNode = renameBehavior(load(), 'cm', 'comma');
    expect(renamedNode.behaviors[1]).toMatchObject({ label: 'comma', name: 'comma' });
  });
});

describe('deleteBehavior', () => {
  it('removes it and replaces references with &none', () => {
    const { model, replaced } = deleteBehavior(load(), 'cm');
    expect(model.behaviors.map((b) => b.label)).toEqual(['hm']);
    expect(model.layers[0]?.bindings.map(formatBinding)).toEqual(['&hm LSHFT A', '&none', '&kp C']);
    expect(model.layers[0]?.sensorBindings?.map(formatBinding)).toEqual(['&none']);
    expect(replaced).toBe(2);
  });
});

describe('replaceBehavior', () => {
  it('swaps in an edited behavior', () => {
    const model = load();
    const [first] = model.behaviors;
    if (!first) throw new Error('no behavior');
    const edited = { ...first, bindings: [{ behavior: 'mo', params: [] }, { behavior: 'kp', params: [] }] };
    expect(replaceBehavior(model, 'hm', edited).behaviors[0]).toBe(edited);
  });
});
