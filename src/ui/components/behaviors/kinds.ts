import type { BehaviorSection } from '../../../core/keymap/behaviorSummary.ts';
import type { IconName } from '../Icon.tsx';

export type ListSection = BehaviorSection | 'macro';

/** How each kind looks: its list heading, icon, and `kind-tone-*` class (which sets `--kind`). */
export const KIND_LOOK: Record<ListSection, { title: string; icon: IconName; tone: string }> = {
  'hold-tap': { title: 'Hold-taps', icon: 'hand', tone: 'holdtap' },
  'mod-morph': { title: 'Mod-morphs', icon: 'shuffle', tone: 'modmorph' },
  'tap-dance': { title: 'Tap-dances', icon: 'pointer', tone: 'tapdance' },
  'sensor-rotate': { title: 'Encoders', icon: 'rotateCw', tone: 'encoder' },
  module: { title: 'From modules', icon: 'puzzle', tone: 'module' },
  other: { title: 'Other', icon: 'code', tone: 'module' },
  macro: { title: 'Macros', icon: 'listOrdered', tone: 'macro' },
};

/** The properties the diagrams edit themselves; the rest are listed below them. */
export const HOLD_TAP_DIAGRAM_PROPERTIES = ['flavor', 'tapping-term-ms'];
export const MOD_MORPH_DIAGRAM_PROPERTIES = ['mods'];

/** The order of the Behaviors list's sections. */
export const SECTION_ORDER: BehaviorSection[] = ['hold-tap', 'mod-morph', 'tap-dance', 'sensor-rotate', 'module', 'other'];
