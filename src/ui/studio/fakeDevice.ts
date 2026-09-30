import { behaviorCatalog, type ParamType } from '../../core/catalog/behaviors.ts';
import { customLayout, type ZmkConfig } from '../../core/config.ts';
import { withLayerUids } from '../../core/keymap/layerIds.ts';
import { physicalLayoutFor } from '../../core/layouts/index.ts';
import type { PhysicalLayout } from '../../core/layouts/types.ts';
import { BUILTIN_DISPLAY_NAMES, deviceName, resolveBehaviors, type CellKind, type DeviceBehavior } from '../../core/studio/behaviors.ts';
import { enumCellCount } from '../../core/studio/enums.ts';
import { desiredKeymap, type DeviceKeymap, type DeviceLayer } from '../../core/studio/reconcile.ts';
import type { DeviceBinding } from '../../core/studio/translate.ts';
import { DisconnectedError, LockedError, RejectedError, type DeviceNotification, type StudioDevice } from './device.ts';

export interface FakeDeviceOptions {
  name: string;
  locked: boolean;
  behaviors: DeviceBehavior[];
  layers: DeviceLayer[];
  /** Spare layers the keyboard can switch on. */
  spare: number;
  layout: PhysicalLayout;
}

export interface FakeDevice extends StudioDevice {
  /** Presses the `&studio_unlock` key. */
  unlock(): void;
  /** Locks again, as after the idle timeout. */
  relock(): void;
  /** Pulls the cable. */
  pull(): void;
}

const copy = (layers: DeviceLayer[]): DeviceLayer[] => layers.map((l) => ({ ...l, bindings: l.bindings.map((b) => ({ ...b })) }));

/** An in-memory keyboard that behaves like ZMK Studio firmware, for tests and `?studio=fake`. */
export function createFakeDevice(options: FakeDeviceOptions): FakeDevice {
  let locked = options.locked;
  let open = true;
  let layers = copy(options.layers);
  let saved = copy(layers);
  const allIds = [...layers.map((l) => l.id)];
  for (let id = 0; allIds.length < layers.length + options.spare; id++) if (!allIds.includes(id)) allIds.push(id);
  let unsaved = false;
  const listeners = new Set<(n: DeviceNotification) => void>();
  const closers = new Set<() => void>();
  const notify = (n: DeviceNotification) => listeners.forEach((l) => l(n));

  const alive = () => {
    if (!open) throw new DisconnectedError();
  };
  const secured = () => {
    alive();
    if (locked) throw new LockedError();
  };
  const changed = () => {
    if (!unsaved) {
      unsaved = true;
      notify({ kind: 'unsaved', unsaved: true });
    }
  };
  const layer = (id: number) => {
    const found = layers.find((l) => l.id === id);
    if (!found) throw new RejectedError(`No layer ${id}`);
    return found;
  };
  const keyCount = layers[0]?.bindings.length ?? 0;
  const transparent = options.behaviors.find((b) => b.name === 'Transparent')?.id ?? 0;

  return {
    name: async () => (alive(), options.name),
    locked: async () => (alive(), locked),
    behaviors: async () => (secured(), options.behaviors),
    keymap: async (): Promise<DeviceKeymap> => {
      secured();
      return { layers: copy(layers), availableLayers: allIds.length - layers.length };
    },
    layouts: async () => (secured(), { active: 0, layouts: [options.layout] }),
    setBinding: async (layerId: number, key: number, binding: DeviceBinding) => {
      secured();
      const target = layer(layerId);
      if (!options.behaviors.some((b) => b.id === binding.behaviorId)) throw new RejectedError('The keyboard has no such behavior.');
      if (key < 0 || key >= target.bindings.length) throw new RejectedError('No such key.');
      target.bindings[key] = { ...binding };
      changed();
    },
    addLayer: async () => {
      secured();
      const id = allIds.find((i) => !layers.some((l) => l.id === i));
      if (id === undefined) throw new RejectedError('The keyboard has no spare layers left.');
      layers.push({ id, name: '', bindings: Array.from({ length: keyCount }, () => ({ behaviorId: transparent, param1: 0, param2: 0 })) });
      changed();
      return id;
    },
    removeLayer: async (index: number) => {
      secured();
      if (!layers[index]) throw new RejectedError(`No layer at ${index}`);
      layers.splice(index, 1);
      changed();
    },
    moveLayer: async (from: number, to: number) => {
      secured();
      const [moved] = layers.splice(from, 1);
      if (!moved || to < 0 || to > layers.length) throw new RejectedError('No such layer position.');
      layers.splice(to, 0, moved);
      changed();
    },
    renameLayer: async (id: number, name: string) => {
      secured();
      layer(id).name = name;
      changed();
    },
    hasUnsavedChanges: async () => (secured(), unsaved),
    save: async () => {
      secured();
      saved = copy(layers);
      unsaved = false;
      notify({ kind: 'unsaved', unsaved: false });
    },
    discard: async () => {
      secured();
      layers = copy(saved);
      unsaved = false;
      notify({ kind: 'unsaved', unsaved: false });
    },
    onNotification: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onClose: (listener) => {
      closers.add(listener);
      return () => closers.delete(listener);
    },
    close: async () => {
      if (!open) return;
      open = false;
      closers.forEach((c) => c());
    },
    unlock: () => {
      locked = false;
      notify({ kind: 'lock', locked: false });
    },
    relock: () => {
      locked = true;
      notify({ kind: 'lock', locked: true });
    },
    pull: () => {
      if (!open) return;
      open = false;
      closers.forEach((c) => c());
    },
  };
}

const cellOf = (type: ParamType | undefined): CellKind =>
  !type ? 'none' : type.kind === 'keycode' ? 'keycode' : type.kind === 'layer' ? 'layer' : 'number';

/** A fake keyboard flashed with `config`: its keymap, every built-in behavior and its own, and its layout. */
export function fakeDeviceFor(config: ZmkConfig, { locked = true, spare = 2 } = {}): FakeDevice {
  const catalog = behaviorCatalog(config.keymap);
  const names = [
    ...Object.entries(BUILTIN_DISPLAY_NAMES),
    ...config.keymap.behaviors.flatMap((b) => (b.label ? [[deviceName(b), b.label] as [string, string]] : [])),
  ];
  const behaviors: DeviceBehavior[] = names.map(([name, ref], i) => {
    const params = catalog.find((d) => d.ref === ref)?.params ?? [];
    const cells = enumCellCount(ref);
    const kinds: [CellKind, CellKind] = cells ? ['number', cells > 1 ? 'number' : 'none'] : [cellOf(params[0]), cellOf(params[1])];
    return { id: i + 1, name, cells: kinds };
  });
  const keymap = withLayerUids(config.keymap);
  const uidToId = new Map(keymap.layers.map((l, i) => [l.uid ?? -1, i]));
  const desired = desiredKeymap(keymap, uidToId, behaviors, resolveBehaviors(behaviors, keymap));
  const transparent = behaviors.find((b) => b.name === 'Transparent')?.id ?? 0;
  const layers = desired.layers.map((l, i) => ({
    id: i,
    name: l.name,
    bindings: l.bindings.map((b) => b ?? { behaviorId: transparent, param1: 0, param2: 0 }),
  }));
  const keyCount = keymap.layers[0]?.bindings.length ?? 0;
  const layout = physicalLayoutFor(config.keyboard, keyCount, undefined, customLayout(config));
  return createFakeDevice({ name: config.studio?.device ?? 'Fake Keyboard', locked, behaviors, layers, spare, layout });
}
