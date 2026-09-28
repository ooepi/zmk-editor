import type { Binding, KeymapModel, Layer } from './model.ts';

/** How many encoders the keymap binds (the most sensor bindings on any layer). */
export function sensorCount(model: KeymapModel): number {
  return Math.max(0, ...model.layers.map((l) => l.sensorBindings?.length ?? 0));
}

/**
 * Sets one encoder's binding on one layer. Other layers are left alone: in
 * ZMK a layer without an encoder binding falls through to the layers below
 * (`&trans` can't be listed in sensor-bindings). Earlier encoders on this
 * layer are padded with `&trans` (the generator fills such gaps), and
 * trailing fall-through entries are dropped.
 */
export function setSensorBinding(model: KeymapModel, layerIndex: number, sensor: number, binding: Binding): KeymapModel {
  if (!model.layers[layerIndex]) throw new Error('No such layer');
  const layers = model.layers.map((layer, index) => {
    if (index !== layerIndex) return layer;
    const list = [...(layer.sensorBindings ?? [])];
    while (list.length <= sensor) list.push({ behavior: 'trans', params: [] });
    list[sensor] = binding;
    return withSensorBindings(layer, list);
  });
  return { ...model, layers };
}

/** The layer with these encoder bindings, trailing fall-through entries dropped; none left removes the property. */
export function withSensorBindings(layer: Layer, list: Binding[]): Layer {
  let end = list.length;
  while (end > 0 && fallsThrough(list[end - 1])) end--;
  const next = { ...layer };
  if (end === 0) delete next.sensorBindings;
  else next.sensorBindings = list.slice(0, end);
  return next;
}

/** `&trans`/`&none` (or no binding): the encoder falls through to the layers below. */
const fallsThrough = (b: Binding | undefined) => !b || b.behavior === 'trans' || b.behavior === 'none';

/** What layers `index` and below do for `sensor`, skipping those that fall through. */
function effectiveBelow(layers: Layer[], index: number, sensor: number): Binding | undefined {
  for (let k = index; k >= 0; k--) {
    const b = layers[k]?.sensorBindings?.[sensor];
    if (!fallsThrough(b)) return b;
  }
  return undefined;
}

/**
 * Each layer's `sensor-bindings` as ZMK v0.3 can compile them. `&trans` and
 * `&none` have no `#sensor-binding-cells`, so they can't be listed; ZMK
 * falls through for a layer without the property or past the end of a
 * shorter list. So trailing fall-through entries are dropped, a layer with
 * nothing left gets no property (undefined), and a gap before a real binding
 * takes what the layers below do for that encoder. A gap nothing below
 * fills stays as it is; `sensorGaps` reports it.
 */
export function sensorBindingsForZmk(model: Pick<KeymapModel, 'layers'>): (Binding[] | undefined)[] {
  return model.layers.map((layer, index) => {
    const list = layer.sensorBindings ?? [];
    let end = list.length;
    while (end > 0 && fallsThrough(list[end - 1])) end--;
    if (end === 0) return undefined;
    return list.slice(0, end).map((b, sensor) => (fallsThrough(b) ? (effectiveBelow(model.layers, index - 1, sensor) ?? b) : b));
  });
}

/** Encoder gaps ZMK can't express: no binding on a layer or below, but a later encoder on that layer has one. */
export function sensorGaps(model: Pick<KeymapModel, 'layers'>): string[] {
  const zmk = sensorBindingsForZmk(model);
  return model.layers.flatMap((layer, index) => {
    const list = zmk[index] ?? [];
    const name = layer.displayName ?? layer.name;
    return list.flatMap((b, sensor) => {
      if (!fallsThrough(b)) return [];
      const next = list.findIndex((later, i) => i > sensor && !fallsThrough(later));
      return [`Encoder ${sensor + 1} has no binding on layer ${name}, but encoder ${next + 1} after it does; ZMK can’t leave that gap. Give encoder ${sensor + 1} a binding there.`];
    });
  });
}

