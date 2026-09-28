import { behaviorKind, type Behavior, type KeymapModel } from '../keymap/model.ts';
import { modulesIncludedBy } from './modules.ts';

export interface EnumOption {
  value: string;
  /** Keycap label. */
  label: string;
  /** Takes a number as the next param, e.g. `BT_SEL 0`; shown `offset` higher (profile 0 → "BT 1"). */
  number?: { label: string; default: number; offset?: number };
}

export type ParamType =
  | { kind: 'keycode'; default?: string }
  | { kind: 'layer' }
  | { kind: 'enum'; options: EnumOption[]; default?: string }
  | { kind: 'number'; default?: number }
  /** zmk-unicode: one alias (UC_SV_AE), two code points, or a mode switch. Uses all params. */
  | { kind: 'unicode' }
  | { kind: 'raw' };

export type BehaviorGroup =
  | 'keys'
  | 'layers'
  | 'bluetooth'
  | 'mouse'
  | 'lighting'
  | 'system'
  | 'custom'
  /** From installed modules. */
  | 'module'
  /** Only inside macros. */
  | 'macro'
  /** Only on encoders. */
  | 'sensor';

export const BEHAVIOR_GROUPS: { id: BehaviorGroup; label: string }[] = [
  { id: 'keys', label: 'Keys' },
  { id: 'layers', label: 'Layers' },
  { id: 'bluetooth', label: 'Bluetooth & output' },
  { id: 'mouse', label: 'Mouse' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'system', label: 'System' },
  { id: 'custom', label: 'Your behaviors' },
  { id: 'module', label: 'From modules' },
  { id: 'macro', label: 'Macro controls' },
  { id: 'sensor', label: 'Encoder' },
];

/** Where a binding is used; decides which behaviors are offered. */
export type BindingContext = 'key' | 'macro' | 'sensor';

const CONTEXT_GROUPS: Record<BindingContext, (group: BehaviorGroup, ref: string) => boolean> = {
  key: (group) => group !== 'macro' && group !== 'sensor',
  macro: (group) => group !== 'sensor',
  sensor: (group, ref) => group === 'sensor' || ref === 'trans' || ref === 'none',
};

/** Whether a behavior can be used in a context (macro controls only in macros, …). */
export function offeredIn(context: BindingContext, def: BehaviorDef): boolean {
  return CONTEXT_GROUPS[context](def.group, def.ref);
}

export interface BehaviorDef {
  /** What bindings reference: `kp` for `&kp`. */
  ref: string;
  name: string;
  description: string;
  group: BehaviorGroup;
  params: ParamType[];
  /** The param shown as the hold label on keycaps. */
  holdParam?: number;
  /** Header the behavior's constants need. */
  include?: string;
  /** Small keycap label saying what kind of key this is. */
  tag?: string;
  /** Keycap label for behaviors without params. */
  keycap?: string;
  /** The keymap's own definition, for custom behaviors. */
  behavior?: Behavior;
}

const enumOf = (options: EnumOption[], defaultValue?: string): ParamType =>
  defaultValue ? { kind: 'enum', options, default: defaultValue } : { kind: 'enum', options };
const opt = (value: string, label: string): EnumOption => ({ value, label });

/** ZMK v0.3 built-in behaviors that can go on a key. */
export const BUILTIN_BEHAVIORS: BehaviorDef[] = [
  { ref: 'kp', name: 'Key press', description: 'Sends a key, optionally with modifiers.', group: 'keys', params: [{ kind: 'keycode' }] },
  {
    ref: 'mt',
    name: 'Mod-tap',
    description: 'A modifier when held, a key when tapped.',
    group: 'keys',
    params: [{ kind: 'keycode', default: 'LSHIFT' }, { kind: 'keycode' }],
    holdParam: 0,
  },
  { ref: 'sk', name: 'Sticky key', description: 'Applies to the next key press only.', group: 'keys', params: [{ kind: 'keycode' }], tag: 'sticky' },
  { ref: 'kt', name: 'Key toggle', description: 'Toggles a key between pressed and released.', group: 'keys', params: [{ kind: 'keycode' }], tag: 'toggle' },
  { ref: 'trans', name: 'Transparent', description: 'Uses the binding of the next active layer below.', group: 'keys', params: [], keycap: '▽' },
  { ref: 'none', name: 'None', description: 'Does nothing.', group: 'keys', params: [], keycap: '✕' },
  { ref: 'caps_word', name: 'Caps word', description: 'Capitalises letters until a word ends.', group: 'keys', params: [], keycap: 'CapsWd' },
  { ref: 'key_repeat', name: 'Key repeat', description: 'Repeats the last key sent.', group: 'keys', params: [], keycap: 'Repeat' },
  { ref: 'gresc', name: 'Grave escape', description: 'Escape, or ` with Shift or GUI.', group: 'keys', params: [], keycap: 'Esc/`' },
  { ref: 'mo', name: 'Momentary layer', description: 'The layer is active while held.', group: 'layers', params: [{ kind: 'layer' }] },
  {
    ref: 'lt',
    name: 'Layer-tap',
    description: 'A layer when held, a key when tapped.',
    group: 'layers',
    params: [{ kind: 'layer' }, { kind: 'keycode' }],
    holdParam: 0,
  },
  { ref: 'tog', name: 'Toggle layer', description: 'Turns the layer on or off.', group: 'layers', params: [{ kind: 'layer' }] },
  { ref: 'to', name: 'To layer', description: 'Turns on the layer and turns off all others except the base.', group: 'layers', params: [{ kind: 'layer' }] },
  { ref: 'sl', name: 'Sticky layer', description: 'The layer is active for the next key press.', group: 'layers', params: [{ kind: 'layer' }] },
  {
    ref: 'bt',
    name: 'Bluetooth',
    description: 'Selects, cycles or clears Bluetooth profiles.',
    group: 'bluetooth',
    include: 'dt-bindings/zmk/bt.h',
    tag: 'bt',
    params: [
      enumOf(
        [
          { value: 'BT_SEL', label: 'BT', number: { label: 'Profile', default: 0, offset: 1 } },
          opt('BT_NXT', 'BT Next'),
          opt('BT_PRV', 'BT Prev'),
          opt('BT_CLR', 'BT Clear'),
          opt('BT_CLR_ALL', 'BT Clr All'),
          { value: 'BT_DISC', label: 'BT Disc', number: { label: 'Profile', default: 0, offset: 1 } },
        ],
        'BT_SEL',
      ),
    ],
  },
  {
    ref: 'out',
    name: 'Output',
    description: 'Chooses between USB and Bluetooth output.',
    group: 'bluetooth',
    include: 'dt-bindings/zmk/outputs.h',
    tag: 'out',
    params: [enumOf([opt('OUT_TOG', 'USB/BLE'), opt('OUT_USB', 'USB'), opt('OUT_BLE', 'BLE')])],
  },
  {
    ref: 'mkp',
    name: 'Mouse button',
    description: 'Clicks a mouse button. Needs CONFIG_ZMK_POINTING=y.',
    group: 'mouse',
    include: 'dt-bindings/zmk/pointing.h',
    tag: 'mouse',
    params: [
      enumOf([opt('MB1', 'LClick'), opt('MB2', 'RClick'), opt('MB3', 'MClick'), opt('MB4', 'Back'), opt('MB5', 'Fwd')]),
    ],
  },
  {
    ref: 'mmv',
    name: 'Mouse move',
    description: 'Moves the pointer. Needs CONFIG_ZMK_POINTING=y.',
    group: 'mouse',
    include: 'dt-bindings/zmk/pointing.h',
    tag: 'mouse',
    params: [
      enumOf([opt('MOVE_UP', 'Ms ↑'), opt('MOVE_DOWN', 'Ms ↓'), opt('MOVE_LEFT', 'Ms ←'), opt('MOVE_RIGHT', 'Ms →')]),
    ],
  },
  {
    ref: 'msc',
    name: 'Mouse scroll',
    description: 'Scrolls. Needs CONFIG_ZMK_POINTING=y.',
    group: 'mouse',
    include: 'dt-bindings/zmk/pointing.h',
    tag: 'scroll',
    params: [
      enumOf([opt('SCRL_UP', 'Wh ↑'), opt('SCRL_DOWN', 'Wh ↓'), opt('SCRL_LEFT', 'Wh ←'), opt('SCRL_RIGHT', 'Wh →')]),
    ],
  },
  {
    ref: 'rgb_ug',
    name: 'RGB underglow',
    description: 'Controls RGB underglow.',
    group: 'lighting',
    include: 'dt-bindings/zmk/rgb.h',
    tag: 'rgb',
    params: [
      enumOf([
        opt('RGB_TOG', 'Toggle'),
        opt('RGB_ON', 'On'),
        opt('RGB_OFF', 'Off'),
        opt('RGB_HUI', 'Hue+'),
        opt('RGB_HUD', 'Hue-'),
        opt('RGB_SAI', 'Sat+'),
        opt('RGB_SAD', 'Sat-'),
        opt('RGB_BRI', 'Bri+'),
        opt('RGB_BRD', 'Bri-'),
        opt('RGB_SPI', 'Speed+'),
        opt('RGB_SPD', 'Speed-'),
        opt('RGB_EFF', 'Effect+'),
        opt('RGB_EFR', 'Effect-'),
      ]),
    ],
  },
  {
    ref: 'bl',
    name: 'Backlight',
    description: 'Controls the backlight.',
    group: 'lighting',
    include: 'dt-bindings/zmk/backlight.h',
    tag: 'bl',
    params: [
      enumOf([
        opt('BL_TOG', 'Toggle'),
        opt('BL_ON', 'On'),
        opt('BL_OFF', 'Off'),
        opt('BL_INC', 'Bri+'),
        opt('BL_DEC', 'Bri-'),
        opt('BL_CYCLE', 'Cycle'),
      ]),
    ],
  },
  {
    ref: 'ext_power',
    name: 'External power',
    description: 'Switches power to displays and LEDs.',
    group: 'system',
    include: 'dt-bindings/zmk/ext_power.h',
    tag: 'power',
    params: [enumOf([opt('EP_TOG', 'Ext Pwr'), opt('EP_ON', 'Ext On'), opt('EP_OFF', 'Ext Off')])],
  },
  { ref: 'bootloader', name: 'Bootloader', description: 'Restarts into the bootloader for flashing.', group: 'system', params: [], keycap: 'Boot' },
  { ref: 'sys_reset', name: 'Reset', description: 'Restarts the keyboard.', group: 'system', params: [], keycap: 'Reset' },
  { ref: 'macro_tap', name: 'Tap mode', description: 'The following keys are tapped (the default).', group: 'macro', params: [], keycap: 'Tap mode' },
  { ref: 'macro_press', name: 'Press mode', description: 'The following keys are pressed and held.', group: 'macro', params: [], keycap: 'Press mode' },
  { ref: 'macro_release', name: 'Release mode', description: 'The following keys are released.', group: 'macro', params: [], keycap: 'Release mode' },
  {
    ref: 'macro_pause_for_release',
    name: 'Pause for release',
    description: 'Waits until the macro key is released, then continues.',
    group: 'macro',
    params: [],
    keycap: 'Wait for release',
  },
  {
    ref: 'macro_wait_time',
    name: 'Set wait time',
    description: 'Changes the pause after each following step (ms).',
    group: 'macro',
    params: [{ kind: 'number', default: 100 }],
    tag: 'wait ms',
  },
  {
    ref: 'macro_tap_time',
    name: 'Set tap time',
    description: 'Changes how long following taps are held (ms).',
    group: 'macro',
    params: [{ kind: 'number', default: 30 }],
    tag: 'tap ms',
  },
  {
    ref: 'inc_dec_kp',
    name: 'Key per direction',
    description: 'Sends one key when turned clockwise and another when turned counter-clockwise.',
    group: 'sensor',
    params: [{ kind: 'keycode', default: 'C_VOL_UP' }, { kind: 'keycode', default: 'C_VOL_DN' }],
  },
];

const BUILTIN_BY_REF = new Map(BUILTIN_BEHAVIORS.map((def) => [def.ref, def]));

function cellCount(behavior: Behavior, name = '#binding-cells'): number {
  const cells = behavior.properties.find((p) => p.name === name)?.values[0];
  const count = cells?.kind === 'cells' ? Number(cells.tokens[0]) : 0;
  return Number.isInteger(count) ? count : 0;
}

function customDef(behavior: Behavior): BehaviorDef | undefined {
  const kind = behaviorKind(behavior);
  if (!behavior.label) return undefined;
  const base = { ref: behavior.label, name: behavior.label, group: 'custom' as const, behavior };
  if (kind === 'sensor-rotate') {
    const count = cellCount(behavior, '#sensor-binding-cells');
    const params = Array.from({ length: count }, (): ParamType => ({ kind: 'raw' }));
    return { ...base, group: 'sensor', description: 'Your encoder behavior: one binding per direction.', params };
  }
  if (kind === 'hold-tap') {
    const params = [0, 1].map((i): ParamType => {
      const inner = behavior.bindings[i];
      const type = inner && BUILTIN_BY_REF.get(inner.behavior)?.params[0];
      return type?.kind === 'layer' ? { kind: 'layer' } : type?.kind === 'keycode' ? { kind: 'keycode' } : { kind: 'raw' };
    });
    return { ...base, description: 'Your hold-tap: hold and tap behaviors.', params, holdParam: 0 };
  }
  const params = Array.from({ length: cellCount(behavior) }, (): ParamType => ({ kind: 'raw' }));
  const description =
    kind === 'mod-morph'
      ? 'Your mod-morph: another binding while a modifier is held.'
      : kind === 'macro'
        ? 'Your macro.'
        : kind === 'tap-dance'
          ? 'Your tap-dance.'
          : `Your ${behavior.compatible} behavior.`;
  return { ...base, description, params };
}

/** Built-in behaviors, those of modules the keymap includes, and the keymap's own. */
export function behaviorCatalog(model: KeymapModel): BehaviorDef[] {
  const includes = model.topLevel.flatMap((i) => (i.kind === 'include' ? [i.path] : []));
  const fromModules = modulesIncludedBy(includes).flatMap((m) => m.behaviors);
  const custom = model.behaviors.map(customDef).filter((d): d is BehaviorDef => d !== undefined);
  return [...BUILTIN_BEHAVIORS, ...fromModules, ...custom];
}

const GROUP_LABELS = new Map(BEHAVIOR_GROUPS.map((g) => [g.id, g.label]));

/**
 * Behaviors matching a search, best first: the ref or name itself, then ones
 * starting or containing it, then ones whose description or group has every word.
 */
export function searchBehaviors(defs: BehaviorDef[], query: string): BehaviorDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return defs;
  const words = q.split(/\s+/);
  const score = (def: BehaviorDef): number => {
    const names = [def.ref.toLowerCase(), def.name.toLowerCase()];
    if (names.includes(q)) return 4;
    if (names.some((n) => n.startsWith(q))) return 3;
    if (names.some((n) => n.includes(q))) return 2;
    const text = [...names, def.description, GROUP_LABELS.get(def.group) ?? ''].join(' ').toLowerCase();
    return words.every((w) => text.includes(w)) ? 1 : 0;
  };
  return defs
    .map((def, index) => ({ def, index, score: score(def) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((m) => m.def);
}

export function findBehavior(catalog: BehaviorDef[], ref: string): BehaviorDef | undefined {
  return catalog.find((def) => def.ref === ref);
}

/** Built-in behaviors are fixed; this finds one without building a catalog. */
export function findBuiltinBehavior(ref: string): BehaviorDef | undefined {
  return BUILTIN_BY_REF.get(ref);
}
