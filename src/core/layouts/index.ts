import { lily58TextLayout } from './lily58.ts';
import type { TextLayout } from './types.ts';

const TEXT_LAYOUTS: Record<string, TextLayout> = {
  lily58: lily58TextLayout,
};

/** The built-in text layout for a keyboard (shield base name), if there is one. */
export function getTextLayout(keyboard: string): TextLayout | undefined {
  return TEXT_LAYOUTS[keyboard];
}

export type { TextLayout } from './types.ts';
