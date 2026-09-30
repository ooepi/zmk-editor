import { behaviorCatalog } from '../catalog/behaviors.ts';
import { nodeName } from '../keymap/edit.ts';
import type { Behavior, KeymapModel } from '../keymap/model.ts';

/** What a binding param cell holds, as far as ZMK Studio's metadata says. */
export type CellKind = 'keycode' | 'layer' | 'number' | 'none';

/** One value a param can take, as ZMK Studio describes it (the protocol's own shape, trimmed). */
export interface ParamValueDescription {
  name: string;
  nil?: object;
  constant?: number;
  range?: { min: number; max: number };
  hidUsage?: { keyboardMax: number; consumerMax: number };
  layerId?: object;
}

export interface ParamSet {
  param1: ParamValueDescription[];
  param2: ParamValueDescription[];
}

/** A behavior compiled into the keyboard's firmware. */
export interface DeviceBehavior {
  id: number;
  /** Its `display-name`, or node name when it has none. */
  name: string;
  cells: [CellKind, CellKind];
}

function cellKind(values: ParamValueDescription[]): CellKind {
  if (values.some((v) => v.hidUsage)) return 'keycode';
  if (values.some((v) => v.layerId)) return 'layer';
  return values.some((v) => !v.nil) ? 'number' : 'none';
}

/** Each param cell's kind across every metadata set a behavior lists. */
export function cellKinds(sets: ParamSet[]): [CellKind, CellKind] {
  return [cellKind(sets.flatMap((s) => s.param1)), cellKind(sets.flatMap((s) => s.param2))];
}

/** Display names of ZMK's built-in behaviors (their `display-name`, or node name), from ZMK v0.3. */
export const BUILTIN_DISPLAY_NAMES: Record<string, string> = {
  'Key Press': 'kp',
  'Mod-Tap': 'mt',
  'Sticky Key': 'sk',
  'Key Toggle': 'kt',
  Transparent: 'trans',
  None: 'none',
  'Caps Word': 'caps_word',
  'Key Repeat': 'key_repeat',
  'Grave/Escape': 'gresc',
  'Momentary Layer': 'mo',
  'Layer-Tap': 'lt',
  'Toggle Layer': 'tog',
  'To Layer': 'to',
  'Sticky Layer': 'sl',
  Bluetooth: 'bt',
  'Output Selection': 'out',
  'Mouse Key Press': 'mkp',
  mouse_move: 'mmv',
  mouse_scroll: 'msc',
  Underglow: 'rgb_ug',
  Backlight: 'bl',
  'External Power': 'ext_power',
  Bootloader: 'bootloader',
  Reset: 'sys_reset',
  'Studio Unlock': 'studio_unlock',
};

/** The name ZMK reports for a keymap behavior: its display-name, else its (older) label, else its node name. */
export function deviceName(behavior: Behavior): string {
  for (const property of ['display-name', 'label']) {
    const value = behavior.properties.find((p) => p.name === property)?.values[0];
    if (value?.kind === 'string') return value.value;
  }
  return behavior.name;
}

export interface BehaviorMap {
  refById: Map<number, string>;
  idByRef: Map<string, number>;
  /** Keyboard behaviors that match nothing the keymap knows; they got made-up refs. */
  unknown: DeviceBehavior[];
}

/** Matches the keyboard's behaviors to the refs bindings use (`kp`, `hml`, …). */
export function resolveBehaviors(device: DeviceBehavior[], keymap: KeymapModel): BehaviorMap {
  const custom = new Map<string, string>();
  for (const b of keymap.behaviors) if (b.label && !custom.has(deviceName(b))) custom.set(deviceName(b), b.label);
  const taken = new Set(behaviorCatalog(keymap).map((d) => d.ref));
  const refById = new Map<number, string>();
  const idByRef = new Map<string, number>();
  const unknown: DeviceBehavior[] = [];
  for (const behavior of device) {
    let ref = custom.get(behavior.name) ?? BUILTIN_DISPLAY_NAMES[behavior.name];
    if (!ref || idByRef.has(ref)) {
      ref = nodeName(behavior.name, taken, 'behavior');
      unknown.push(behavior);
    }
    taken.add(ref);
    refById.set(behavior.id, ref);
    idByRef.set(ref, behavior.id);
  }
  return { refById, idByRef, unknown };
}
