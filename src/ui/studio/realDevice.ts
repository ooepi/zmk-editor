import { call_rpc, create_rpc_connection, MetaError, type Request, type RequestResponse } from '@zmkfirmware/zmk-studio-ts-client';
import { LockState } from '@zmkfirmware/zmk-studio-ts-client/core';
import { ErrorConditions } from '@zmkfirmware/zmk-studio-ts-client/meta';
import { SaveChangesErrorCode, SetLayerBindingResponse, SetLayerPropsResponse } from '@zmkfirmware/zmk-studio-ts-client/keymap';
import { connect as openSerialPort } from '@zmkfirmware/zmk-studio-ts-client/transport/serial';
import type { PhysicalLayout } from '../../core/layouts/types.ts';
import { cellKinds, type DeviceBehavior, type ParamValueDescription } from '../../core/studio/behaviors.ts';
import type { DeviceKeymap } from '../../core/studio/reconcile.ts';
import { DisconnectedError, LockedError, RejectedError, type DeviceNotification, type StudioDevice } from './device.ts';

const BINDING_ERRORS: Record<number, string> = {
  [SetLayerBindingResponse.SET_LAYER_BINDING_RESP_INVALID_LOCATION]: 'The keyboard has no such key or layer.',
  [SetLayerBindingResponse.SET_LAYER_BINDING_RESP_INVALID_BEHAVIOR]: 'The keyboard doesn’t have that behavior.',
  [SetLayerBindingResponse.SET_LAYER_BINDING_RESP_INVALID_PARAMETERS]: 'The keyboard didn’t accept that key’s settings.',
};

const SAVE_ERRORS: Record<number, string> = {
  [SaveChangesErrorCode.SAVE_CHANGES_ERR_NO_SPACE]: 'The keyboard has no room left to save the keymap.',
  [SaveChangesErrorCode.SAVE_CHANGES_ERR_NOT_SUPPORTED]: 'This keyboard can’t save changes.',
};

const values = (list: ParamValueDescription[]) =>
  list.map((v): ParamValueDescription => {
    const out: ParamValueDescription = { name: v.name };
    if (v.nil) out.nil = {};
    if (v.constant !== undefined) out.constant = v.constant;
    if (v.range) out.range = { min: v.range.min, max: v.range.max };
    if (v.hidUsage) out.hidUsage = { keyboardMax: v.hidUsage.keyboardMax, consumerMax: v.hidUsage.consumerMax };
    if (v.layerId) out.layerId = {};
    return out;
  });

/** Asks the browser for the keyboard's serial port and opens a ZMK Studio connection to it. */
export async function connectSerialDevice(): Promise<StudioDevice> {
  const transport = await openSerialPort();
  const conn = create_rpc_connection(transport, { signal: transport.abortController.signal });
  let open = true;
  const listeners = new Set<(n: DeviceNotification) => void>();
  const closers = new Set<() => void>();
  const closed = () => {
    if (!open) return;
    open = false;
    closers.forEach((c) => c());
  };

  // Notifications arrive on their own stream; when it ends, the keyboard is gone.
  void (async () => {
    const reader = conn.notification_readable.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const lock = value.core?.lockStateChanged;
        if (lock !== undefined) listeners.forEach((l) => l({ kind: 'lock', locked: lock !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED }));
        const unsaved = value.keymap?.unsavedChangesStatusChanged;
        if (unsaved !== undefined) listeners.forEach((l) => l({ kind: 'unsaved', unsaved }));
      }
    } catch {
      // The stream errors when the port goes away; that's a disconnect too.
    } finally {
      closed();
    }
  })();

  const call = async (request: Omit<Request, 'requestId'>): Promise<RequestResponse> => {
    if (!open) throw new DisconnectedError();
    try {
      return await call_rpc(conn, request);
    } catch (error) {
      if (error instanceof MetaError && error.condition === ErrorConditions.UNLOCK_REQUIRED) throw new LockedError();
      if (!open) throw new DisconnectedError();
      throw error instanceof Error ? error : new Error(String(error));
    }
  };

  return {
    name: async () => (await call({ core: { getDeviceInfo: true } })).core?.getDeviceInfo?.name ?? 'Keyboard',
    locked: async () => (await call({ core: { getLockState: true } })).core?.getLockState !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED,
    behaviors: async () => {
      const ids = (await call({ behaviors: { listAllBehaviors: true } })).behaviors?.listAllBehaviors?.behaviors ?? [];
      const out: DeviceBehavior[] = [];
      for (const behaviorId of ids) {
        const details = (await call({ behaviors: { getBehaviorDetails: { behaviorId } } })).behaviors?.getBehaviorDetails;
        if (!details) continue;
        const sets = details.metadata.map((s) => ({ param1: values(s.param1), param2: values(s.param2) }));
        out.push({ id: details.id, name: details.displayName, cells: cellKinds(sets) });
      }
      return out;
    },
    keymap: async (): Promise<DeviceKeymap> => {
      const keymap = (await call({ keymap: { getKeymap: true } })).keymap?.getKeymap;
      if (!keymap) throw new Error('The keyboard sent no keymap.');
      return {
        layers: keymap.layers.map((l) => ({ id: l.id, name: l.name, bindings: l.bindings.map((b) => ({ behaviorId: b.behaviorId, param1: b.param1, param2: b.param2 })) })),
        availableLayers: keymap.availableLayers,
      };
    },
    layouts: async () => {
      const result = (await call({ keymap: { getPhysicalLayouts: true } })).keymap?.getPhysicalLayouts;
      const layouts = (result?.layouts ?? []).map(
        (layout): PhysicalLayout => ({
          name: layout.name,
          keys: layout.keys.map((k) => ({ x: k.x, y: k.y, w: k.width, h: k.height, r: k.r / 100, rx: k.rx, ry: k.ry })),
        }),
      );
      return { active: result?.activeLayoutIndex ?? 0, layouts };
    },
    setBinding: async (layerId, keyPosition, binding) => {
      const result = (await call({ keymap: { setLayerBinding: { layerId, keyPosition, binding } } })).keymap?.setLayerBinding;
      if (result !== SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK) throw new RejectedError(BINDING_ERRORS[result ?? -1] ?? 'The keyboard didn’t accept the change.');
    },
    addLayer: async () => {
      const result = (await call({ keymap: { addLayer: {} } })).keymap?.addLayer;
      const id = result?.ok?.layer?.id;
      if (id === undefined) throw new RejectedError('The keyboard has no spare layers left.');
      return id;
    },
    removeLayer: async (layerIndex) => {
      const result = (await call({ keymap: { removeLayer: { layerIndex } } })).keymap?.removeLayer;
      if (!result?.ok) throw new RejectedError('The keyboard couldn’t remove the layer.');
    },
    moveLayer: async (startIndex, destIndex) => {
      const result = (await call({ keymap: { moveLayer: { startIndex, destIndex } } })).keymap?.moveLayer;
      if (!result?.ok) throw new RejectedError('The keyboard couldn’t move the layer.');
    },
    renameLayer: async (layerId, name) => {
      const result = (await call({ keymap: { setLayerProps: { layerId, name } } })).keymap?.setLayerProps;
      if (result !== SetLayerPropsResponse.SET_LAYER_PROPS_RESP_OK) throw new RejectedError('The keyboard couldn’t rename the layer.');
    },
    hasUnsavedChanges: async () => (await call({ keymap: { checkUnsavedChanges: true } })).keymap?.checkUnsavedChanges ?? false,
    save: async () => {
      const result = (await call({ keymap: { saveChanges: true } })).keymap?.saveChanges;
      if (!result?.ok) throw new RejectedError(SAVE_ERRORS[result?.err ?? -1] ?? 'The keyboard couldn’t save the changes.');
    },
    discard: async () => {
      await call({ keymap: { discardChanges: true } });
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
      transport.abortController.abort();
      closed();
    },
  };
}
