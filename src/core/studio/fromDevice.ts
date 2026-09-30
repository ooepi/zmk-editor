import type { ZmkConfig } from '../config.ts';
import { parseKconfig } from '../files/kconfig.ts';
import { nodeName } from '../keymap/edit.ts';
import { withLayerUids } from '../keymap/layerIds.ts';
import { emptyKeymap, type Behavior, type Binding, type KeymapModel, type Layer } from '../keymap/model.ts';
import type { PhysicalLayout } from '../layouts/types.ts';
import { resolveBehaviors, type DeviceBehavior } from './behaviors.ts';
import type { DeviceKeymap } from './reconcile.ts';
import { fromDevice, type TranslateContext } from './translate.ts';

/** Marks a behavior the editor made up for a keyboard behavior it doesn't know (Studio-only configs). */
export const STUDIO_BEHAVIOR = 'zmk,behavior-studio-device';

const NONE: Binding = { behavior: 'none', params: [] };

export interface FromDeviceResult {
  keymap: KeymapModel;
  /** Each layer's uid → the keyboard's layer id. */
  uidToId: Map<number, number>;
  /** Keys whose keyboard binding couldn't be read; they kept the editor's binding (or &none). */
  unreadable: number;
}

/**
 * The keyboard's layers and bindings over `base`. Layers keep their place, uid and other properties;
 * with `invent`, behaviors the editor doesn't know are added as made-up behaviors instead of skipped.
 */
export function keymapFromDevice(base: KeymapModel, device: DeviceKeymap, behaviors: DeviceBehavior[], { invent }: { invent: boolean }): FromDeviceResult {
  const resolved = resolveBehaviors(behaviors, base);
  let model = base;
  if (invent && resolved.unknown.length > 0) {
    const invented = resolved.unknown.map((b): Behavior => {
      const ref = resolved.refById.get(b.id) ?? b.name;
      const cells = b.cells.filter((k) => k !== 'none').length;
      return {
        name: ref,
        label: ref,
        compatible: STUDIO_BEHAVIOR,
        bindings: [],
        properties: [
          { name: 'display-name', values: [{ kind: 'string', value: b.name }] },
          { name: '#binding-cells', values: [{ kind: 'cells', tokens: [String(cells)] }] },
        ],
      };
    });
    model = { ...model, behaviors: [...model.behaviors, ...invented] };
  } else if (!invent) {
    for (const b of resolved.unknown) resolved.refById.delete(b.id);
  }

  const position = new Map(device.layers.map((l, i) => [l.id, i]));
  const ctx: TranslateContext = {
    keymap: model,
    device: new Map(behaviors.map((b) => [b.id, b])),
    behaviors: resolved,
    layerId: (index) => device.layers[index]?.id,
    layerIndex: (id) => position.get(id),
  };
  let unreadable = 0;
  const taken = new Set<string>();
  const layers = device.layers.map((deviceLayer, i): Layer => {
    const old = base.layers[i];
    const bindings = deviceLayer.bindings.map((binding, key) => {
      const result = fromDevice(binding, ctx);
      if ('ok' in result) return result.ok;
      unreadable++;
      return old?.bindings[key] ?? NONE;
    });
    // ZMK reports "" for a layer without a display-name: that keeps whatever name the editor had.
    const title = deviceLayer.name;
    const renamed = title !== '' && title !== old?.displayName;
    const name = old && !renamed && !taken.has(old.name) ? old.name : nodeName(title || `layer_${i}`, taken);
    taken.add(name);
    if (old) return renamed ? { ...old, name, displayName: title, bindings } : { ...old, name, bindings };
    return title ? { name, displayName: title, bindings, properties: [] } : { name, bindings, properties: [] };
  });

  const keymap = withLayerUids({ ...model, layers });
  const uidToId = new Map(keymap.layers.map((l, i) => [l.uid ?? -1, device.layers[i]?.id ?? -1]));
  return { keymap, uidToId, unreadable };
}

/** A config for a keyboard edited through ZMK Studio alone, with no repository behind it. */
export function configFromDevice(
  deviceName: string,
  device: DeviceKeymap,
  layout: PhysicalLayout,
  behaviors: DeviceBehavior[],
): { config: ZmkConfig; uidToId: Map<number, number>; unreadable: number } {
  const base: KeymapModel = {
    ...emptyKeymap(),
    topLevel: [
      { kind: 'include', path: 'behaviors.dtsi', system: true },
      { kind: 'include', path: 'dt-bindings/zmk/keys.h', system: true },
    ],
  };
  const { keymap, uidToId, unreadable } = keymapFromDevice(base, device, behaviors, { invent: true });
  const config: ZmkConfig = {
    keyboard: nodeName(deviceName, new Set(), 'keyboard'),
    keymap,
    kconfig: parseKconfig(''),
    west: { zmkVersion: 'v0.3', modules: [], selfPath: 'config' },
    build: { include: [] },
    layout,
    studio: { device: deviceName },
  };
  return { config, uidToId, unreadable };
}
