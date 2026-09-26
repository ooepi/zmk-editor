import { describe, expect, it } from 'vitest';
import { createCombo, deleteCombo, renameCombo, replaceCombo, toggleComboKey } from './comboEdit.ts';
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
