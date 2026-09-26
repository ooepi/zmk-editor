import type { Binding, KeymapModel } from './model.ts';

/** How many encoders the keymap binds (the most sensor bindings on any layer). */
export function sensorCount(model: KeymapModel): number {
  return Math.max(0, ...model.layers.map((l) => l.sensorBindings?.length ?? 0));
}

/**
 * Sets one encoder's binding on one layer. Every layer is padded with
 * `&trans` so each has a binding for each encoder.
 */
export function setSensorBinding(model: KeymapModel, layerIndex: number, sensor: number, binding: Binding): KeymapModel {
  if (!model.layers[layerIndex]) throw new Error('No such layer');
  const count = Math.max(sensorCount(model), sensor + 1);
  const layers = model.layers.map((layer, index) => {
    const sensorBindings = [...(layer.sensorBindings ?? [])];
    while (sensorBindings.length < count) sensorBindings.push({ behavior: 'trans', params: [] });
    if (index === layerIndex) sensorBindings[sensor] = binding;
    return { ...layer, sensorBindings };
  });
  return { ...model, layers };
}
