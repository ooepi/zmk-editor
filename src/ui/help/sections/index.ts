import { BEHAVIORS } from './behaviors.tsx';
import type { HelpSection } from './common.tsx';
import { CONFIG } from './config.tsx';
import { KEYBOARD } from './keyboard.tsx';
import { KEYS } from './keys.tsx';
import { REFERENCE } from './reference.tsx';
import { START } from './start.tsx';

/** The guide, in reading order. */
export const HELP_SECTIONS: HelpSection[] = [...START, ...KEYS, ...BEHAVIORS, ...CONFIG, ...KEYBOARD, ...REFERENCE];
