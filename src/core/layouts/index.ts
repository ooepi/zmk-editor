import { lily58PhysicalLayout, lily58TextLayout } from './lily58.ts';
import type { PhysicalLayout, TextLayout } from './types.ts';

const TEXT_LAYOUTS: Record<string, TextLayout> = {
  lily58: lily58TextLayout,
};

const PHYSICAL_LAYOUTS: Record<string, PhysicalLayout> = {
  lily58: lily58PhysicalLayout,
};

/** The built-in text layout for a keyboard (shield base name), if there is one. */
export function getTextLayout(keyboard: string): TextLayout | undefined {
  return TEXT_LAYOUTS[keyboard];
}

/** The built-in physical layout for a keyboard, if there is one. */
export function getPhysicalLayout(keyboard: string): PhysicalLayout | undefined {
  return PHYSICAL_LAYOUTS[keyboard];
}

/** A plain grid for keyboards without a built-in layout. */
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
