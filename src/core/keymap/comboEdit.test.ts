import { describe, expect, it } from 'vitest';
import { comboParts, createCombo, deleteCombo, renameCombo, replaceCombo, toggleComboKey } from './comboEdit.ts';
import { generateKeymap } from './generator.ts';
import { importKeymap } from './importer.ts';
import { emptyKeymap } from './model.ts';

describe('combos', () => {
  it('creates combos with unique names', () => {
    let model = emptyKeymap();
    const first = createCombo(model, [12, 13]);
    expect(first).toEqual({ name: 'combo_1', keyPositions: ['12', '13'], binding: { behavior: 'kp', params: ['ESC'] }, properties: [] });
    model = { ...model, combos: [first] };
    expect(createCombo(model, [0, 1]).name).toBe('combo_2');
  });

  it('toggles keys and keeps positions sorted', () => {
    const combo = createCombo(emptyKeymap(), [5, 1]);
    expect(combo.keyPositions).toEqual(['1', '5']);
    expect(toggleComboKey(combo, 3).keyPositions).toEqual(['1', '3', '5']);
    expect(toggleComboKey(combo, 5).keyPositions).toEqual(['1']);
  });

  it('replaces, renames and deletes', () => {
    const combo = createCombo(emptyKeymap(), [0, 1]);
    let model = { ...emptyKeymap(), combos: [combo] };
    model = replaceCombo(model, 'combo_1', { ...combo, layers: ['0'] });
    expect(model.combos[0]?.layers).toEqual(['0']);
    model = renameCombo(model, 'combo_1', 'Esc combo!');
    expect(model.combos[0]?.name).toBe('esc_combo');
    model = deleteCombo(model, 'esc_combo');
    expect(model.combos).toEqual([]);
  });

  it('generates combos that import back the same', () => {
    const model = { ...emptyKeymap(), combos: [createCombo(emptyKeymap(), [0, 1])] };
    expect(importKeymap(generateKeymap(model)).model).toEqual(model);
  });
});

describe('comboParts', () => {
  const SOURCE = `
#include <behaviors.dtsi>
/ {
    keymap {
        compatible = "zmk,keymap";
        base { display-name = "Base"; bindings = <&kp A &kp B &trans &mo 1>; };
        nav { display-name = "Nav"; bindings = <&trans &trans &trans &trans>; };
    };
};`;
  const model = importKeymap(SOURCE).model;

  it('names the keys by their base-layer labels and says what the combo sends', () => {
    expect(comboParts(createCombo(model, [0, 1]), model)).toEqual({ keys: ['A', 'B'], sends: 'Esc' });
  });

  it('shows a transparent key as ▽, and no keys as an empty list', () => {
    expect(comboParts(createCombo(model, [2]), model).keys).toEqual(['▽']);
    expect(comboParts(createCombo(model, []), model).keys).toEqual([]);
  });

  it('names a layer the combo switches to', () => {
    const parts = comboParts(createCombo(model, [0, 1], { behavior: 'mo', params: ['1'] }), model);
    expect(parts.sends).toBe('Nav');
    // …and how: while held (mo), toggled (tog)…
    expect(parts.sendsTag).toBe('mo');
  });
});
