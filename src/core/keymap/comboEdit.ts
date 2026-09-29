import { describeBinding, displayContext } from './display.ts';
import { nodeName } from './edit.ts';
import type { Binding, Combo, KeymapModel } from './model.ts';

function sortPositions(tokens: string[]): string[] {
  const numeric = tokens.filter((t) => /^\d+$/.test(t)).sort((a, b) => Number(a) - Number(b));
  return [...numeric, ...tokens.filter((t) => !/^\d+$/.test(t))];
}

/** A new combo on the given keys. Add it to `model.combos` yourself. */
export function createCombo(
  model: KeymapModel,
  positions: number[],
  binding: Binding = { behavior: 'kp', params: ['ESC'] },
): Combo {
  const taken = new Set(model.combos.map((c) => c.name));
  let n = 1;
  while (taken.has(`combo_${n}`)) n++;
  return { name: `combo_${n}`, keyPositions: sortPositions(positions.map(String)), binding, properties: [] };
}

export function toggleComboKey(combo: Combo, position: number): Combo {
  const token = String(position);
  const keyPositions = combo.keyPositions.includes(token)
    ? combo.keyPositions.filter((t) => t !== token)
    : sortPositions([...combo.keyPositions, token]);
  return { ...combo, keyPositions };
}

export function replaceCombo(model: KeymapModel, name: string, combo: Combo): KeymapModel {
  return { ...model, combos: model.combos.map((c) => (c.name === name ? combo : c)) };
}

export function renameCombo(model: KeymapModel, name: string, displayName: string): KeymapModel {
  const taken = new Set(model.combos.filter((c) => c.name !== name).map((c) => c.name));
  const next = nodeName(displayName, taken, 'combo');
  return { ...model, combos: model.combos.map((c) => (c.name === name ? { ...c, name: next } : c)) };
}

export function deleteCombo(model: KeymapModel, name: string): KeymapModel {
  return { ...model, combos: model.combos.filter((c) => c.name !== name) };
}

/** A combo for people: the labels of its keys (on the base layer) and what it sends. */
export function comboParts(combo: Combo, model: KeymapModel): { keys: string[]; sends: string; sendsTag?: string } {
  const ctx = displayContext(model);
  const base = model.layers[0]?.bindings ?? [];
  const keys = combo.keyPositions.map((position) => {
    const binding = base[Number(position)];
    return binding ? describeBinding(binding, ctx).main : `#${position}`;
  });
  const sends = describeBinding(combo.binding, ctx);
  // A layer key says how it works (mo, tog, lt…): "NAV" alone doesn't.
  return sends.kind === 'layer' && sends.sub ? { keys, sends: sends.main, sendsTag: sends.sub } : { keys, sends: sends.main };
}
