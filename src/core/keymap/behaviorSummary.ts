import { BUILTIN_BEHAVIORS } from '../catalog/behaviors.ts';
import { MODULE_BEHAVIOR_NAMES } from '../catalog/modules.ts';
import { MODIFIER_MASKS, propertySchema, readProperty } from '../catalog/properties.ts';
import { describeBinding, displayContext } from './display.ts';
import { behaviorKind, type Behavior, type BehaviorKind, type KeymapModel } from './model.ts';

export const KIND_LABELS: Record<BehaviorKind, string> = {
  'hold-tap': 'Hold-tap',
  'mod-morph': 'Mod-morph',
  'sensor-rotate': 'Encoder',
  'tap-dance': 'Tap-dance',
  macro: 'Macro',
  other: 'Other',
};

export function kindLabel(behavior: Pick<Behavior, 'compatible'>): string {
  return MODULE_BEHAVIOR_NAMES[behavior.compatible] ?? KIND_LABELS[behaviorKind(behavior)];
}

/** The Behaviors list's sections: the editable kinds, then module behaviors, then anything else. */
export type BehaviorSection = Exclude<BehaviorKind, 'macro'> | 'module';

export function behaviorSection(behavior: Pick<Behavior, 'compatible'>): BehaviorSection {
  if (behavior.compatible in MODULE_BEHAVIOR_NAMES) return 'module';
  const kind = behaviorKind(behavior);
  return kind === 'macro' ? 'other' : kind;
}

function property(behavior: Behavior, name: string) {
  const schema = propertySchema(behavior.compatible)?.find((s) => s.name === name);
  return schema ? (readProperty(behavior.properties, schema) ?? schema.default) : undefined;
}

/** What a behavior does, in one line for the list: "Hold: Key press · Tap: Key press · 200 ms". */
export function behaviorSummary(behavior: Behavior, model: KeymapModel): string {
  const ctx = displayContext(model);
  const label = (i: number) => {
    const binding = behavior.bindings[i];
    return binding ? describeBinding(binding, ctx).main : '?';
  };
  switch (behaviorKind(behavior)) {
    case 'hold-tap': {
      const name = (i: number) => {
        const ref = behavior.bindings[i]?.behavior ?? '?';
        return BUILTIN_BEHAVIORS.find((d) => d.ref === ref)?.name ?? `&${ref}`;
      };
      return `Hold: ${name(0)} · Tap: ${name(1)} · ${String(property(behavior, 'tapping-term-ms'))} ms`;
    }
    case 'mod-morph': {
      const mods = property(behavior, 'mods');
      const names = Array.isArray(mods) ? mods.map((m) => MODIFIER_MASKS.find((x) => x.id === m)?.label ?? m) : [];
      return `${label(0)} → ${label(1)} with ${names.length > 0 ? names.join(', ') : 'a modifier'}`;
    }
    case 'tap-dance':
      return behavior.bindings.map((_, i) => label(i)).join(' · ');
    case 'sensor-rotate':
      return `↻ ${label(0)} · ↺ ${label(1)}`;
    case 'macro': {
      const n = behavior.bindings.length;
      return `${n} step${n === 1 ? '' : 's'}`;
    }
    case 'other':
      return kindLabel(behavior);
  }
}
