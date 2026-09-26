import type { KeymapModel } from './model.ts';

/** Integer values of object-like `#define`s, e.g. `#define NAV 1`. */
export function numericDefines(model: KeymapModel): Map<string, number> {
  const defines = new Map<string, number>();
  for (const item of model.topLevel) {
    if (item.kind === 'define' && !item.params && /^\d+$/.test(item.value)) defines.set(item.name, Number(item.value));
  }
  return defines;
}

/** The layer index a param token refers to, if it is a number or a numeric `#define`. */
export function resolveLayerIndex(token: string, defines: Map<string, number>): number | undefined {
  if (/^\d+$/.test(token)) return Number(token);
  return defines.get(token);
}

export function layerDisplayName(model: KeymapModel, token: string, defines = numericDefines(model)): string {
  const index = resolveLayerIndex(token, defines);
  const layer = index === undefined ? undefined : model.layers[index];
  return layer ? (layer.displayName ?? layer.name) : token;
}
