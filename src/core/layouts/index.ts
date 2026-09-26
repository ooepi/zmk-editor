import { findKeyboard, layoutsFor } from '../catalog/keyboards.ts';
import { textLayoutFromPhysical } from './derive.ts';
import { lily58PhysicalLayout, lily58TextLayout } from './lily58.ts';
import type { PhysicalLayout, TextLayout } from './types.ts';

const TEXT_LAYOUTS: Record<string, TextLayout> = {
  lily58: lily58TextLayout,
};

const PHYSICAL_LAYOUTS: Record<string, PhysicalLayout> = {
  lily58: lily58PhysicalLayout,
};

/** The built-in physical layout for a keyboard, if there is one. */
export function getPhysicalLayout(keyboard: string): PhysicalLayout | undefined {
  return PHYSICAL_LAYOUTS[keyboard];
}

/**
 * The layout to draw: a hand-made one, else the catalog layout with the
 * keymap's key count (`preferred` picks among variants), else a grid.
 */
export function physicalLayoutFor(keyboard: string, keyCount: number, preferred?: string): PhysicalLayout {
  const builtin = PHYSICAL_LAYOUTS[keyboard];
  if (builtin && builtin.keys.length === keyCount) return builtin;
  const def = findKeyboard(keyboard);
  const fitting = def ? layoutsFor(def, keyCount) : [];
  return fitting.find((l) => l.name === preferred) ?? fitting[0] ?? gridLayout(keyCount);
}

/** The text grid for the generated `.keymap`, when one is known or can be derived. */
export function textLayoutFor(keyboard: string, keyCount: number): TextLayout | undefined {
  const builtin = TEXT_LAYOUTS[keyboard];
  if (builtin) return builtin;
  const layout = physicalLayoutFor(keyboard, keyCount);
  return layout.name === 'grid' ? undefined : textLayoutFromPhysical(layout);
}

/** The built-in text layout for a keyboard (shield base name), if there is one. */
export function getTextLayout(keyboard: string): TextLayout | undefined {
  return TEXT_LAYOUTS[keyboard];
}

/** A plain grid for keyboards without a known layout. */
export function gridLayout(keyCount: number, columns = 12): PhysicalLayout {
  return {
    name: 'grid',
    keys: Array.from({ length: keyCount }, (_, i) => ({
      x: (i % columns) * 100,
      y: Math.floor(i / columns) * 100,
      w: 100,
      h: 100,
      r: 0,
      rx: 0,
      ry: 0,
    })),
  };
}

export { layoutBounds } from './types.ts';
export type { PhysicalKey, PhysicalLayout, TextLayout } from './types.ts';
