import { describeBinding, displayContext } from './display.ts';
import { layerDisplayName, numericDefines, resolveLayerIndex } from './layers.ts';
import type { KeymapModel } from './model.ts';

export interface ComboRow {
  name: string;
  /** Each key, named by what it does on the base layer (or "Key N" / the raw token). */
  keys: string[];
  /** What the combo sends. */
  sends: string;
  /** "All layers", or the layers it works on. */
  layers: string;
}

/** The keymap's combos in words, for the printed cheat sheet. */
export function comboRows(model: KeymapModel): ComboRow[] {
  const ctx = displayContext(model);
  const defines = numericDefines(model);
  const base = model.layers[0]?.bindings ?? [];
  const keyName = (token: string): string => {
    const index = resolveLayerIndex(token, defines);
    if (index === undefined) return token;
    const binding = base[index];
    return binding ? describeBinding(binding, ctx).main : `Key ${index}`;
  };
  return model.combos.map((combo) => ({
    name: combo.name,
    keys: combo.keyPositions.map(keyName),
    sends: describeBinding(combo.binding, ctx).main,
    layers:
      combo.layers && combo.layers.length > 0
        ? combo.layers.map((token) => layerDisplayName(model, token, defines)).join(', ')
        : 'All layers',
  }));
}
