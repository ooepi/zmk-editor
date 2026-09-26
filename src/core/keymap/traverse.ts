import type { Binding, KeymapModel, Layer } from './model.ts';

/** Applies `fn` to every binding: layers, encoders, behaviors, macros and combos. */
export function mapAllBindings(model: KeymapModel, fn: (binding: Binding) => Binding): KeymapModel {
  return {
    ...model,
    layers: model.layers.map((layer): Layer => {
      const next: Layer = { ...layer, bindings: layer.bindings.map(fn) };
      if (layer.sensorBindings) next.sensorBindings = layer.sensorBindings.map(fn);
      return next;
    }),
    behaviors: model.behaviors.map((b) => ({ ...b, bindings: b.bindings.map(fn) })),
    combos: model.combos.map((c) => ({ ...c, binding: fn(c.binding) })),
  };
}
