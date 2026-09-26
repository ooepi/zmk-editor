import type { DtProperty } from '../dts/ast.ts';
import { BUILTIN_BEHAVIORS } from '../catalog/behaviors.ts';
import type { Behavior, BehaviorKind, Binding, KeymapModel } from './model.ts';
import { mapAllBindings } from './traverse.ts';

/** Labels ZMK already uses, beyond the ones in the behavior catalog. */
const RESERVED = [
  'inc_dec_kp',
  'inc_dec_cp',
  'reset',
  'bootloader',
  'soft_off',
  'studio_unlock',
  'kp',
  'cp',
  'gresc',
  'mkp',
  'mmv',
  'msc',
];

const reservedLabels = new Set([...BUILTIN_BEHAVIORS.map((b) => b.ref), ...RESERVED]);

/** Why a label can't be used, or null when it's fine. `current` is the label being renamed. */
export function validLabel(model: KeymapModel, label: string, current?: string): string | null {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(label)) return 'Use letters, digits and _, starting with a letter.';
  if (label === current) return null;
  if (reservedLabels.has(label) || label.startsWith('macro_')) return `&${label} is a built-in ZMK behavior.`;
  if (model.behaviors.some((b) => b.label === label)) return `&${label} already exists.`;
  return null;
}

export function uniqueLabel(model: KeymapModel, base: string): string {
  let label = base;
  for (let n = 2; validLabel(model, label) !== null; n++) label = `${base}_${n}`;
  return label;
}

const cells = (name: string, ...tokens: string[]): DtProperty => ({ name, values: [{ kind: 'cells', tokens }] });
const kp = (...params: string[]): Binding => ({ behavior: 'kp', params });

export type NewBehaviorKind = Extract<BehaviorKind, 'hold-tap' | 'mod-morph' | 'sensor-rotate' | 'macro' | 'tap-dance'>;

/** A new behavior of the given kind with sensible defaults. Add it to `model.behaviors` yourself. */
export function createBehavior(model: KeymapModel, kind: NewBehaviorKind): Behavior {
  const make = (base: string, compatible: string, properties: DtProperty[], bindings: Binding[]): Behavior => {
    const label = uniqueLabel(model, base);
    return { name: label, label, compatible, properties, bindings };
  };
  switch (kind) {
    case 'hold-tap':
      return make(
        'ht',
        'zmk,behavior-hold-tap',
        [
          cells('#binding-cells', '2'),
          { name: 'flavor', values: [{ kind: 'string', value: 'balanced' }] },
          cells('tapping-term-ms', '200'),
        ],
        [kp(), kp()],
      );
    case 'mod-morph':
      return make(
        'mm',
        'zmk,behavior-mod-morph',
        [cells('#binding-cells', '0'), cells('mods', '(MOD_LSFT|MOD_RSFT)')],
        [kp('COMMA'), kp('SEMI')],
      );
    case 'sensor-rotate':
      return make('rot', 'zmk,behavior-sensor-rotate', [cells('#sensor-binding-cells', '0')], [kp('C_VOL_UP'), kp('C_VOL_DN')]);
    case 'tap-dance':
      return make(
        'td',
        'zmk,behavior-tap-dance',
        [cells('#binding-cells', '0'), cells('tapping-term-ms', '200')],
        [kp('A'), kp('B')],
      );
    case 'macro':
      return make(
        'macro',
        'zmk,behavior-macro',
        [cells('#binding-cells', '0')],
        [{ behavior: 'macro_tap', params: [] }],
      );
  }
}

export function replaceBehavior(model: KeymapModel, label: string, behavior: Behavior): KeymapModel {
  return { ...model, behaviors: model.behaviors.map((b) => (b.label === label ? behavior : b)) };
}

/** Renames a behavior's label (and its node name when that matched) and every `&label` using it. */
export function renameBehavior(model: KeymapModel, from: string, to: string): KeymapModel {
  const renamed = mapAllBindings(model, (b) => (b.behavior === from ? { ...b, behavior: to } : b));
  return {
    ...renamed,
    behaviors: renamed.behaviors.map((b) =>
      b.label === from ? { ...b, label: to, name: b.name === from ? to : b.name } : b,
    ),
  };
}

/** Deletes a behavior; bindings that used it become `&none`. */
export function deleteBehavior(model: KeymapModel, label: string): { model: KeymapModel; replaced: number } {
  let replaced = 0;
  const next = mapAllBindings(model, (b) => {
    if (b.behavior !== label) return b;
    replaced++;
    return { behavior: 'none', params: [] };
  });
  return { model: { ...next, behaviors: next.behaviors.filter((b) => b.label !== label) }, replaced };
}
