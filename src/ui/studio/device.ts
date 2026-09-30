import type { DeviceBehavior } from '../../core/studio/behaviors.ts';
import type { DeviceKeymap } from '../../core/studio/reconcile.ts';
import type { DeviceBinding } from '../../core/studio/translate.ts';
import type { PhysicalLayout } from '../../core/layouts/types.ts';

export type DeviceNotification = { kind: 'lock'; locked: boolean } | { kind: 'unsaved'; unsaved: boolean };

/** A keyboard running ZMK Studio, as the editor talks to it. */
export interface StudioDevice {
  /** The keyboard's name (`CONFIG_ZMK_KEYBOARD_NAME`). */
  name(): Promise<string>;
  locked(): Promise<boolean>;
  behaviors(): Promise<DeviceBehavior[]>;
  keymap(): Promise<DeviceKeymap>;
  /** The physical layouts the firmware has, and which one is in use. */
  layouts(): Promise<{ active: number; layouts: PhysicalLayout[] }>;
  setBinding(layerId: number, key: number, binding: DeviceBinding): Promise<void>;
  /** Switches on a spare layer; returns its id. */
  addLayer(): Promise<number>;
  removeLayer(index: number): Promise<void>;
  moveLayer(from: number, to: number): Promise<void>;
  renameLayer(id: number, name: string): Promise<void>;
  hasUnsavedChanges(): Promise<boolean>;
  save(): Promise<void>;
  discard(): Promise<void>;
  /** Called for lock and unsaved-changes notifications; returns an unsubscribe function. */
  onNotification(listener: (n: DeviceNotification) => void): () => void;
  /** Called once when the connection ends (cable pulled, port closed). */
  onClose(listener: () => void): () => void;
  close(): Promise<void>;
}

/** The keyboard refused a call because it's locked: press the `&studio_unlock` key. */
export class LockedError extends Error {
  constructor() {
    super('The keyboard is locked. Press your Studio unlock key.');
    this.name = 'LockedError';
  }
}

/** The keyboard said no to a change, e.g. a behavior or layer it doesn't have. */
export class RejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RejectedError';
  }
}

/** The connection is gone. */
export class DisconnectedError extends Error {
  constructor() {
    super('The keyboard was disconnected.');
    this.name = 'DisconnectedError';
  }
}
