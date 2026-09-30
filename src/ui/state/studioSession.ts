import { useEffect, useRef, useState, type Dispatch } from 'react';
import type { ZmkConfig } from '../../core/config.ts';
import { formatBinding } from '../../core/keymap/bindings.ts';
import type { KeymapModel } from '../../core/keymap/model.ts';
import type { PhysicalLayout } from '../../core/layouts/types.ts';
import { resolveBehaviors, type DeviceBehavior } from '../../core/studio/behaviors.ts';
import { compareKeymaps, type Comparison } from '../../core/studio/compare.ts';
import { configFromDevice, keymapFromDevice } from '../../core/studio/fromDevice.ts';
import { desiredKeymap, reconcile, type Desired, type DeviceKeymap, type StudioOp } from '../../core/studio/reconcile.ts';
import { DisconnectedError, LockedError, RejectedError, type StudioDevice } from '../studio/device.ts';
import type { EditorAction } from './editorReducer.ts';

export type StudioStatus =
  | { phase: 'idle'; message?: string }
  | { phase: 'connecting' }
  /** Waiting for the `&studio_unlock` key. */
  | { phase: 'locked' }
  | { phase: 'loading' }
  /** The keyboard's keymap differs from the config in the editor; the user picks which one wins. */
  | { phase: 'mismatch'; comparison: Comparison }
  | { phase: 'connected' }
  | { phase: 'error'; message: string };

export interface StudioSessionOptions {
  /** Opens the keyboard: asks for the serial port, or a fake keyboard in tests and `?studio=fake`. */
  open: () => Promise<StudioDevice>;
  /** The config in the editor is the demo or a Studio-only one: take the keyboard's keymap without asking. */
  loadFromKeyboard: boolean;
}

export type StudioSession = ReturnType<typeof useStudioSession>;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const cellKey = (uid: number, key: number) => `${uid}:${key}`;
const opKey = (op: StudioOp) => JSON.stringify(op);

/** A plain row of keys, for a keyboard that reports no physical layout. */
function rowLayout(keys: number): PhysicalLayout {
  return { name: 'Keys', keys: Array.from({ length: keys }, (_, i) => ({ x: (i % 12) * 100, y: Math.floor(i / 12) * 100, w: 100, h: 100, r: 0, rx: 0, ry: 0 })) };
}

async function apply(device: StudioDevice, op: StudioOp, mirror: DeviceKeymap, uidToId: Map<number, number>): Promise<DeviceKeymap> {
  switch (op.kind) {
    case 'setBinding': {
      await device.setBinding(op.layerId, op.key, op.binding);
      const layer = mirror.layers.find((l) => l.id === op.layerId);
      if (layer) layer.bindings[op.key] = { ...op.binding };
      return mirror;
    }
    case 'renameLayer': {
      await device.renameLayer(op.id, op.name);
      const layer = mirror.layers.find((l) => l.id === op.id);
      if (layer) layer.name = op.name;
      return mirror;
    }
    case 'moveLayer': {
      await device.moveLayer(op.from, op.to);
      const [moved] = mirror.layers.splice(op.from, 1);
      if (moved) mirror.layers.splice(op.to, 0, moved);
      return mirror;
    }
    case 'removeLayer':
      await device.removeLayer(op.index);
      mirror.layers.splice(op.index, 1);
      mirror.availableLayers += 1;
      return mirror;
    case 'addLayer': {
      const id = await device.addLayer();
      uidToId.set(op.uid, id);
      // The new layer's starting keys come from the keyboard; read it back rather than guess.
      return device.keymap();
    }
  }
}

/**
 * A ZMK Studio connection, kept for the whole app: connecting (and waiting for the unlock key),
 * deciding whose keymap wins, then sending every keymap edit to the keyboard as it happens.
 */
export function useStudioSession(config: ZmkConfig, dispatch: Dispatch<EditorAction>, options: StudioSessionOptions) {
  const [status, setStatus] = useState<StudioStatus>({ phase: 'idle' });
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  /** `uid:key` of keys the keyboard can't take until the next build. */
  const [needsBuild, setNeedsBuild] = useState<ReadonlySet<string>>(() => new Set());
  const [deviceRefs, setDeviceRefs] = useState<ReadonlySet<string> | null>(null);
  const [freeLayers, setFreeLayers] = useState(0);
  /** Why the last save or discard didn't work. */
  const [error, setError] = useState<string | null>(null);

  const configRef = useRef(config);
  const optionsRef = useRef(options);
  useEffect(() => {
    configRef.current = config;
    optionsRef.current = options;
  });

  const generation = useRef(0);
  const current = (g: number) => generation.current === g;
  const device = useRef<StudioDevice | null>(null);
  const cleanup = useRef<(() => void)[]>([]);
  const behaviors = useRef<DeviceBehavior[]>([]);
  const mirror = useRef<DeviceKeymap>({ layers: [], availableLayers: 0 });
  const uidToId = useRef(new Map<number, number>());
  /** The keymap when the session started: keys the keyboard can't take only need a build once they change. */
  const baseline = useRef<KeymapModel | null>(null);
  /** The keyboard's keymap and layout while the user decides a mismatch. */
  const pending = useRef<{ keymap: DeviceKeymap; layout: PhysicalLayout; comparison: Comparison } | null>(null);
  /** Changes the keyboard refused, so they aren't sent again and again. */
  const rejected = useRef(new Set<string>());
  const locked = useRef(false);
  const unlockWaiters = useRef<(() => void)[]>([]);
  const syncing = useRef<Promise<void> | null>(null);
  const dirty = useRef(false);
  const live = useRef(false);

  const waitForUnlock = (g: number) =>
    new Promise<void>((resolve) => {
      if (!locked.current || !current(g)) resolve();
      else unlockWaiters.current.push(resolve);
    });

  const release = () => {
    for (const fn of cleanup.current.splice(0)) fn();
    live.current = false;
    for (const resolve of unlockWaiters.current.splice(0)) resolve();
  };

  const trackProblems = (desired: Desired, keymap: KeymapModel) => {
    const base = baseline.current;
    const changed = (uid: number, key: number) => {
      const before = base?.layers.find((l) => l.uid === uid)?.bindings[key];
      const now = keymap.layers.find((l) => l.uid === uid)?.bindings[key];
      return !before || !now || formatBinding(before) !== formatBinding(now);
    };
    const noRoom = mirror.current.availableLayers === 0;
    const next = new Set<string>();
    for (const p of desired.problems) {
      if (p.reason === 'pending-layer' && !noRoom) continue;
      if (changed(p.uid, p.key)) next.add(cellKey(p.uid, p.key));
    }
    for (const layer of desired.layers) {
      layer.bindings.forEach((binding, key) => {
        if (layer.id === undefined && noRoom) next.add(cellKey(layer.uid, key));
        else if (binding && layer.id !== undefined && rejected.current.has(opKey({ kind: 'setBinding', layerId: layer.id, key, binding }))) {
          next.add(cellKey(layer.uid, key));
        }
      });
    }
    setNeedsBuild((prev) => (prev.size === next.size && [...next].every((k) => prev.has(k)) ? prev : next));
  };

  const runSync = async (g: number) => {
    try {
      while (dirty.current && current(g) && device.current) {
        dirty.current = false;
        const dev = device.current;
        const keymap = configRef.current.keymap;
        const desired = desiredKeymap(keymap, uidToId.current, behaviors.current, resolveBehaviors(behaviors.current, keymap));
        const ops = reconcile(mirror.current, desired).filter((op) => !rejected.current.has(opKey(op)));
        for (const op of ops) {
          if (!current(g)) return;
          try {
            mirror.current = await apply(dev, op, mirror.current, uidToId.current);
          } catch (err) {
            if (err instanceof LockedError) {
              locked.current = true;
              setStatus({ phase: 'locked' });
              await waitForUnlock(g);
              if (!current(g)) return;
              setStatus({ phase: 'connected' });
              dirty.current = true;
              break;
            }
            if (err instanceof RejectedError) {
              rejected.current.add(opKey(op));
              dirty.current = true;
              continue;
            }
            if (err instanceof DisconnectedError) return;
            throw err;
          }
          if (op.kind === 'addLayer') dirty.current = true;
        }
        if (!current(g)) return;
        setFreeLayers(mirror.current.availableLayers);
        trackProblems(desiredKeymap(configRef.current.keymap, uidToId.current, behaviors.current, resolveBehaviors(behaviors.current, configRef.current.keymap)), configRef.current.keymap);
      }
    } catch (err) {
      if (current(g)) setStatus({ phase: 'error', message: message(err) });
    }
  };

  const requestSync = () => {
    dirty.current = true;
    if (syncing.current) return;
    const g = generation.current;
    syncing.current = runSync(g).finally(() => {
      syncing.current = null;
      if (dirty.current && current(g) && live.current) requestSync();
    });
  };

  const goLive = (keymap: DeviceKeymap, ids: Map<number, number>, base: KeymapModel) => {
    mirror.current = keymap;
    uidToId.current = ids;
    baseline.current = base;
    pending.current = null;
    live.current = true;
    setFreeLayers(keymap.availableLayers);
    setStatus({ phase: 'connected' });
    requestSync();
  };

  // Every keymap change while connected goes to the keyboard.
  useEffect(() => {
    if (status.phase === 'connected') requestSync();
    // requestSync reads everything through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.keymap, status.phase]);

  // Leaving the app closes the port.
  useEffect(
    () => () => {
      generation.current += 1;
      release();
      void device.current?.close();
    },
    [],
  );

  const disconnect = (why?: string) => {
    generation.current += 1;
    release();
    const dev = device.current;
    device.current = null;
    void dev?.close();
    setUnsaved(false);
    setNeedsBuild(new Set());
    setDeviceRefs(null);
    setStatus(why ? { phase: 'idle', message: why } : { phase: 'idle' });
  };

  const connect = async () => {
    disconnect();
    const g = generation.current;
    setError(null);
    setStatus({ phase: 'connecting' });
    let dev: StudioDevice;
    try {
      dev = await optionsRef.current.open();
    } catch (err) {
      // Closing the port picker without choosing is not an error.
      if (current(g)) setStatus(err instanceof DOMException && err.name === 'NotFoundError' ? { phase: 'idle' } : { phase: 'error', message: message(err) });
      return;
    }
    if (!current(g)) {
      void dev.close();
      return;
    }
    device.current = dev;
    rejected.current = new Set();
    cleanup.current.push(
      dev.onNotification((n) => {
        if (!current(g)) return;
        if (n.kind === 'unsaved') {
          setUnsaved(n.unsaved);
          return;
        }
        locked.current = n.locked;
        if (!n.locked) for (const resolve of unlockWaiters.current.splice(0)) resolve();
        if (live.current) setStatus({ phase: n.locked ? 'locked' : 'connected' });
      }),
      dev.onClose(() => {
        if (current(g)) disconnect('The keyboard was disconnected.');
      }),
    );
    try {
      const name = await dev.name();
      setDeviceName(name);
      locked.current = await dev.locked();
      if (locked.current) {
        setStatus({ phase: 'locked' });
        await waitForUnlock(g);
      }
      if (!current(g)) return;
      setStatus({ phase: 'loading' });
      const found = await dev.behaviors();
      const keymap = await dev.keymap();
      const { active, layouts } = await dev.layouts();
      const hasUnsaved = await dev.hasUnsavedChanges();
      if (!current(g)) return;
      behaviors.current = found;
      setUnsaved(hasUnsaved);
      const keyCount = keymap.layers[0]?.bindings.length ?? 0;
      const layout = layouts[active] ?? layouts[0] ?? rowLayout(keyCount);

      if (optionsRef.current.loadFromKeyboard) {
        const loaded = configFromDevice(name, keymap, layout, found);
        setDeviceRefs(new Set(resolveBehaviors(found, loaded.config.keymap).refById.values()));
        dispatch({ type: 'load', config: loaded.config, warnings: [] });
        goLive(keymap, loaded.uidToId, loaded.config.keymap);
        return;
      }
      setDeviceRefs(new Set(resolveBehaviors(found, configRef.current.keymap).refById.values()));
      const comparison = compareKeymaps(configRef.current.keymap, keymap, found);
      if (comparison.keyCountMatches && comparison.summary === '') {
        goLive(keymap, comparison.uidToId, configRef.current.keymap);
        return;
      }
      pending.current = { keymap, layout, comparison };
      setStatus({ phase: 'mismatch', comparison });
    } catch (err) {
      if (current(g)) setStatus({ phase: 'error', message: message(err) });
    }
  };

  /** How a mismatch ends: send the editor's keymap, bring the keyboard's in, edit the keyboard on its own, or cancel. */
  const resolveMismatch = async (choice: 'editor' | 'keyboard' | 'replace' | 'cancel') => {
    const waiting = pending.current;
    if (!waiting || choice === 'cancel') {
      disconnect();
      return;
    }
    const keymap = configRef.current.keymap;
    if (choice === 'editor') {
      goLive(waiting.keymap, waiting.comparison.uidToId, keymap);
    } else if (choice === 'keyboard') {
      const result = keymapFromDevice(keymap, waiting.keymap, behaviors.current, { invent: false });
      const skipped = result.unreadable > 0 ? ` ${result.unreadable} key${result.unreadable === 1 ? '' : 's'} the editor couldn’t read kept your config’s binding.` : '';
      dispatch({ type: 'edit', keymap: result.keymap, notice: `Brought in the keyboard’s keymap.${skipped}` });
      goLive(waiting.keymap, result.uidToId, result.keymap);
    } else {
      const loaded = configFromDevice(deviceName ?? 'Keyboard', waiting.keymap, waiting.layout, behaviors.current);
      setDeviceRefs(new Set(resolveBehaviors(behaviors.current, loaded.config.keymap).refById.values()));
      dispatch({ type: 'load', config: loaded.config, warnings: [] });
      goLive(waiting.keymap, loaded.uidToId, loaded.config.keymap);
    }
  };

  const save = async () => {
    const dev = device.current;
    if (!dev) return;
    setError(null);
    try {
      await syncing.current;
      await dev.save();
      setUnsaved(false);
    } catch (err) {
      setError(message(err));
    }
  };

  /** Throws away the keyboard's unsaved changes, and takes the editor back to match (one undo step). */
  const discard = async () => {
    const dev = device.current;
    if (!dev) return;
    const g = generation.current;
    setError(null);
    try {
      await syncing.current;
      await dev.discard();
      const keymap = await dev.keymap();
      if (!current(g)) return;
      const result = keymapFromDevice(configRef.current.keymap, keymap, behaviors.current, { invent: configRef.current.studio !== undefined });
      mirror.current = keymap;
      uidToId.current = result.uidToId;
      setUnsaved(false);
      dispatch({ type: 'edit', keymap: result.keymap, notice: 'Discarded the changes on the keyboard.' });
    } catch (err) {
      setError(message(err));
    }
  };

  return { status, deviceName, unsaved, needsBuild, deviceRefs, freeLayers, error, connect, disconnect, resolveMismatch, save, discard };
}
