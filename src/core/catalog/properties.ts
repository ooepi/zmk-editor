import type { DtProperty } from '../dts/ast.ts';

export type PropertyType =
  | { kind: 'number'; unit?: string }
  | { kind: 'bool' }
  | { kind: 'enum'; options: string[] }
  | { kind: 'mods' }
  | { kind: 'positions' };

export type PropertyValue = number | string | boolean | string[];

export interface PropertySchema {
  name: string;
  label: string;
  help: string;
  type: PropertyType;
  /** ZMK's default when the property is absent. */
  default?: PropertyValue;
}

const ms = { kind: 'number', unit: 'ms' } as const;

export const HOLD_TAP_PROPERTIES: PropertySchema[] = [
  {
    name: 'flavor',
    label: 'Flavor',
    help: 'How a press is decided as hold or tap when other keys are pressed.',
    type: { kind: 'enum', options: ['hold-preferred', 'balanced', 'tap-preferred', 'tap-unless-interrupted'] },
    default: 'hold-preferred',
  },
  { name: 'tapping-term-ms', label: 'Tapping term', help: 'Held longer than this counts as a hold.', type: ms, default: 200 },
  { name: 'quick-tap-ms', label: 'Quick tap', help: 'Tapping again within this time repeats the tap instead of holding.', type: ms, default: -1 },
  {
    name: 'require-prior-idle-ms',
    label: 'Require prior idle',
    help: 'Pressed this soon after another key, it always taps (good for home-row mods).',
    type: ms,
    default: -1,
  },
  {
    name: 'hold-trigger-key-positions',
    label: 'Hold trigger keys',
    help: 'Only these keys can turn the press into a hold (e.g. keys on the other hand).',
    type: { kind: 'positions' },
  },
  { name: 'hold-trigger-on-release', label: 'Check trigger keys on release', help: 'Decide on key release instead of press.', type: { kind: 'bool' }, default: false },
  { name: 'retro-tap', label: 'Retro tap', help: 'A hold with no other key pressed sends the tap.', type: { kind: 'bool' }, default: false },
  { name: 'hold-while-undecided', label: 'Hold while undecided', help: 'Press the hold behavior until it is decided.', type: { kind: 'bool' }, default: false },
];

export const MOD_MORPH_PROPERTIES: PropertySchema[] = [
  { name: 'mods', label: 'Morph on', help: 'Holding any of these modifiers uses the second binding.', type: { kind: 'mods' } },
  { name: 'keep-mods', label: 'Keep mods', help: 'These modifiers stay pressed for the second binding.', type: { kind: 'mods' } },
];

export const MACRO_PROPERTIES: PropertySchema[] = [
  { name: 'wait-ms', label: 'Wait between steps', help: 'Pause after each step.', type: ms, default: 15 },
  { name: 'tap-ms', label: 'Tap duration', help: 'How long each tapped key is held.', type: ms, default: 30 },
];

export const SENSOR_ROTATE_PROPERTIES: PropertySchema[] = [
  { name: 'tap-ms', label: 'Tap duration', help: 'How long each step is held.', type: ms, default: 5 },
];

export const TAP_DANCE_PROPERTIES: PropertySchema[] = [
  { name: 'tapping-term-ms', label: 'Tapping term', help: 'Time to wait for another tap.', type: ms, default: 200 },
];

export const COMBO_PROPERTIES: PropertySchema[] = [
  { name: 'timeout-ms', label: 'Timeout', help: 'All keys must be pressed within this time.', type: ms, default: 50 },
  { name: 'require-prior-idle-ms', label: 'Require prior idle', help: "Pressed this soon after another key, the combo doesn't fire.", type: ms, default: -1 },
  { name: 'slow-release', label: 'Slow release', help: 'Release the combo when all its keys are released, not the first.', type: { kind: 'bool' }, default: false },
];

export const TRI_STATE_PROPERTIES: PropertySchema[] = [
  {
    name: 'ignored-key-positions',
    label: 'Keys that don’t interrupt',
    help: 'Pressing these keys keeps it active (e.g. a Shift-Tab key for going back).',
    type: { kind: 'positions' },
  },
  { name: 'timeout-ms', label: 'Timeout', help: 'Interrupts by itself this long after the last press.', type: ms, default: -1 },
  { name: 'tap-ms', label: 'Tap duration', help: 'How long tapped keys are held.', type: ms, default: 5 },
];

export const ADAPTIVE_TRIGGER_PROPERTIES: PropertySchema[] = [
  { name: 'max-prior-idle-ms', label: 'Within', help: 'Only when the previous key was pressed at most this long ago.', type: ms, default: -1 },
  { name: 'min-prior-idle-ms', label: 'Not within', help: 'Only when the previous key was pressed at least this long ago.', type: ms, default: -1 },
  {
    name: 'strict-modifiers',
    label: 'Exact modifiers',
    help: 'Modifiers must match exactly (otherwise Shift+A also counts as A).',
    type: { kind: 'bool' },
    default: false,
  },
];

const BY_COMPATIBLE: Record<string, PropertySchema[]> = {
  'zmk,behavior-hold-tap': HOLD_TAP_PROPERTIES,
  'zmk,behavior-mod-morph': MOD_MORPH_PROPERTIES,
  'zmk,behavior-macro': MACRO_PROPERTIES,
  'zmk,behavior-macro-one-param': MACRO_PROPERTIES,
  'zmk,behavior-macro-two-param': MACRO_PROPERTIES,
  'zmk,behavior-sensor-rotate': SENSOR_ROTATE_PROPERTIES,
  'zmk,behavior-sensor-rotate-var': SENSOR_ROTATE_PROPERTIES,
  'zmk,behavior-tap-dance': TAP_DANCE_PROPERTIES,
  'zmk,behavior-tri-state': TRI_STATE_PROPERTIES,
};

export function propertySchema(compatible: string): PropertySchema[] | undefined {
  return BY_COMPATIBLE[compatible];
}

export const MODIFIER_MASKS = [
  { id: 'MOD_LSFT', label: 'Shift' },
  { id: 'MOD_RSFT', label: 'RShift' },
  { id: 'MOD_LCTL', label: 'Ctrl' },
  { id: 'MOD_RCTL', label: 'RCtrl' },
  { id: 'MOD_LALT', label: 'Alt' },
  { id: 'MOD_RALT', label: 'AltGr' },
  { id: 'MOD_LGUI', label: 'Gui' },
  { id: 'MOD_RGUI', label: 'RGui' },
];

function singleCell(property: DtProperty | undefined): string | undefined {
  const [value] = property?.values ?? [];
  return value?.kind === 'cells' && value.tokens.length === 1 ? value.tokens[0] : undefined;
}

/** A typed value, or undefined when absent or not understood (ZMK's default then applies). */
export function readProperty(properties: DtProperty[], schema: PropertySchema): PropertyValue | undefined {
  const property = properties.find((p) => p.name === schema.name);
  switch (schema.type.kind) {
    case 'bool':
      return property !== undefined && property.values.length === 0;
    case 'number': {
      const token = singleCell(property)?.replace(/^\((.*)\)$/, '$1').trim();
      const n = token === undefined ? NaN : Number(token);
      return Number.isInteger(n) ? n : undefined;
    }
    case 'enum': {
      const [value] = property?.values ?? [];
      return value?.kind === 'string' ? value.value : undefined;
    }
    case 'mods': {
      const token = singleCell(property);
      if (token === undefined) return undefined;
      return token
        .replace(/^\((.*)\)$/, '$1')
        .split('|')
        .map((m) => m.trim())
        .filter(Boolean);
    }
    case 'positions': {
      const [value] = property?.values ?? [];
      return value?.kind === 'cells' ? value.tokens : undefined;
    }
  }
}

function encode(schema: PropertySchema, value: PropertyValue | undefined): DtProperty | null {
  if (value === undefined) return null;
  switch (schema.type.kind) {
    case 'bool':
      return value === true ? { name: schema.name, values: [] } : null;
    case 'number':
      return typeof value === 'number'
        ? { name: schema.name, values: [{ kind: 'cells', tokens: [value < 0 ? `(${value})` : String(value)] }] }
        : null;
    case 'enum':
      return typeof value === 'string' ? { name: schema.name, values: [{ kind: 'string', value }] } : null;
    case 'mods':
      return Array.isArray(value) && value.length > 0
        ? { name: schema.name, values: [{ kind: 'cells', tokens: [`(${value.join('|')})`] }] }
        : null;
    case 'positions':
      return Array.isArray(value) && value.length > 0 ? { name: schema.name, values: [{ kind: 'cells', tokens: value }] } : null;
  }
}

/** Sets a property in place (or appends it); `undefined`, `false` or empty removes it. */
export function writeProperty(properties: DtProperty[], schema: PropertySchema, value: PropertyValue | undefined): DtProperty[] {
  const next = encode(schema, value);
  const index = properties.findIndex((p) => p.name === schema.name);
  if (index === -1) return next ? [...properties, next] : properties;
  return next ? properties.with(index, next) : properties.filter((_, i) => i !== index);
}
