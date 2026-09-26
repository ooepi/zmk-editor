import { KEYCODE_DATA, type KeycodeData } from './keycodes.data.ts';

export type KeycodeCategory =
  | 'letters'
  | 'numbers'
  | 'symbols'
  | 'basic'
  | 'modifiers'
  | 'navigation'
  | 'function'
  | 'keypad'
  | 'media'
  | 'system'
  | 'international'
  | 'other';

export const KEYCODE_CATEGORIES: { id: KeycodeCategory; label: string }[] = [
  { id: 'letters', label: 'Letters' },
  { id: 'numbers', label: 'Numbers' },
  { id: 'symbols', label: 'Symbols' },
  { id: 'basic', label: 'Basic' },
  { id: 'modifiers', label: 'Modifiers' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'function', label: 'F-keys' },
  { id: 'keypad', label: 'Keypad' },
  { id: 'media', label: 'Media' },
  { id: 'system', label: 'System' },
  { id: 'international', label: 'Intl' },
  { id: 'other', label: 'Other' },
];

export interface Keycode extends KeycodeData {
  category: KeycodeCategory;
  /** Short label for keycaps. */
  label: string;
}

/** Labels where the description-derived one is too long or unclear. */
const LABELS: Record<string, string> = {
  ESCAPE: 'Esc',
  BACKSPACE: 'Bksp',
  DELETE: 'Del',
  INSERT: 'Ins',
  RETURN: 'Enter',
  RETURN2: 'Enter',
  ENTER: 'Enter',
  TAB: 'Tab',
  SPACE: 'Space',
  CAPSLOCK: 'Caps Lock',
  LEFT_SHIFT: 'Shift',
  RIGHT_SHIFT: 'RShift',
  LEFT_CONTROL: 'Ctrl',
  RIGHT_CONTROL: 'RCtrl',
  LEFT_ALT: 'Alt',
  RIGHT_ALT: 'AltGr',
  LEFT_GUI: 'Gui',
  RIGHT_GUI: 'RGui',
  UP_ARROW: '↑',
  DOWN_ARROW: '↓',
  LEFT_ARROW: '←',
  RIGHT_ARROW: '→',
  PAGE_UP: 'PgUp',
  PAGE_DOWN: 'PgDn',
  HOME: 'Home',
  END: 'End',
  PRINTSCREEN: 'PrtSc',
  SCROLLLOCK: 'ScrLk',
  PAUSE_BREAK: 'Pause',
  K_APPLICATION: 'Menu',
  K_CONTEXT_MENU: 'Menu',
  C_VOLUME_UP: 'Vol+',
  C_VOLUME_DOWN: 'Vol-',
  C_MUTE: 'Mute',
  C_PLAY_PAUSE: 'Play',
  C_NEXT: 'Next',
  C_PREVIOUS: 'Prev',
  C_STOP: 'Stop',
  C_BRIGHTNESS_INC: 'Bri+',
  C_BRIGHTNESS_DEC: 'Bri-',
  SYSTEM_POWER: 'Power',
  SYSTEM_SLEEP: 'Sleep',
  SYSTEM_WAKE_UP: 'Wake',
  NON_US_BACKSLASH: '\\ (ISO)',
  NON_US_HASH: '# (ISO)',
};

const PREFIXES: [RegExp, string][] = [
  [/^Keyboard /, ''],
  [/^Keypad /, 'KP '],
  [/^Consumer /, ''],
  [/^AC /, ''],
];

function deriveLabel(data: KeycodeData): string {
  const fixed = LABELS[data.name];
  if (fixed) return fixed;
  let label = data.description;
  for (const [pattern, replacement] of PREFIXES) label = label.replace(pattern, replacement);
  label = label.split(' and ')[0] ?? label;
  label = label.replace(/\s+\([^()]*\)$/, '').trim();
  if (/^[a-z]$/.test(label)) label = label.toUpperCase();
  return label || data.name;
}

const NAVIGATION = /^(UP_ARROW|DOWN_ARROW|LEFT_ARROW|RIGHT_ARROW|HOME|END|PAGE_UP|PAGE_DOWN|INSERT|DELETE)$/;
const BASIC = /^(ESCAPE|RETURN|RETURN2|TAB|SPACE|BACKSPACE|CAPSLOCK|PRINTSCREEN|SCROLLLOCK|PAUSE_BREAK|K_APPLICATION|K_CONTEXT_MENU)$/;

function categorize(data: KeycodeData): KeycodeCategory {
  const { name, page } = data;
  if (page === 'gd') return 'system';
  if (page === 'consumer') return 'media';
  if (/^[A-Z]$/.test(name)) return 'letters';
  if (/^NUMBER_\d$/.test(name)) return 'numbers';
  if (/^F\d+$/.test(name)) return 'function';
  if (/^KP_/.test(name)) return 'keypad';
  if (/^(LEFT|RIGHT)_(SHIFT|CONTROL|ALT|GUI)$/.test(name)) return 'modifiers';
  if (NAVIGATION.test(name)) return 'navigation';
  if (BASIC.test(name)) return 'basic';
  if (/^(INTERNATIONAL|LANGUAGE|LANG)_?\d/.test(name)) return 'international';
  if (data.shifted || /^Keyboard [^A-Za-z0-9 ]/.test(data.description)) return 'symbols';
  return 'other';
}

export const KEYCODES: Keycode[] = KEYCODE_DATA.map((data) => ({
  ...data,
  category: categorize(data),
  label: deriveLabel(data),
}));

const BY_TOKEN = new Map<string, Keycode>();
for (const keycode of KEYCODES) {
  for (const token of [keycode.name, ...keycode.aliases, ...keycode.deprecated]) {
    if (!BY_TOKEN.has(token)) BY_TOKEN.set(token, keycode);
  }
}

export function findKeycode(token: string): Keycode | undefined {
  return BY_TOKEN.get(token);
}

/** The name to write in a keymap: the shortest non-deprecated alias. */
export function preferredName(keycode: Keycode): string {
  return [keycode.name, ...keycode.aliases].reduce((a, b) => (b.length < a.length ? b : a));
}

/** Ranked search over names, aliases, labels and descriptions. */
export function searchKeycodes(query: string, category?: KeycodeCategory): Keycode[] {
  const q = query.trim().toUpperCase();
  const pool = category ? KEYCODES.filter((k) => k.category === category) : KEYCODES;
  if (!q) return pool;
  const scored: [number, number, Keycode][] = [];
  pool.forEach((keycode, index) => {
    const names = [keycode.name, ...keycode.aliases];
    const label = keycode.label.toUpperCase();
    let score = 0;
    if (names.includes(q) || label === q) score = 4;
    else if (keycode.deprecated.includes(q)) score = 3;
    else if (names.some((n) => n.startsWith(q)) || label.startsWith(q)) score = 2;
    else if (keycode.description.toUpperCase().includes(q) || names.some((n) => n.includes(q))) score = 1;
    if (score > 0) scored.push([score, index, keycode]);
  });
  return scored.sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, , keycode]) => keycode);
}

/** Modifier functions from ZMK's modifiers.h. */
export const MODIFIER_FUNCTIONS = [
  { id: 'LC', label: 'Ctl', name: 'Left Ctrl' },
  { id: 'LS', label: 'Sft', name: 'Left Shift' },
  { id: 'LA', label: 'Alt', name: 'Left Alt' },
  { id: 'LG', label: 'Gui', name: 'Left GUI' },
  { id: 'RC', label: 'RCtl', name: 'Right Ctrl' },
  { id: 'RS', label: 'RSft', name: 'Right Shift' },
  { id: 'RA', label: 'AltGr', name: 'Right Alt' },
  { id: 'RG', label: 'RGui', name: 'Right GUI' },
] as const;

export type ModifierFunction = (typeof MODIFIER_FUNCTIONS)[number]['id'];

const MODIFIER_IDS = new Set<string>(MODIFIER_FUNCTIONS.map((m) => m.id));

export interface KeyExpression {
  /** Outermost first: `LA(LC(TAB))` → `['LA', 'LC']`. */
  mods: ModifierFunction[];
  key: string;
}

/** Parses `LA(LC(TAB))`; null if the token isn't a plain key with modifier functions. */
export function parseKeyExpression(token: string): KeyExpression | null {
  const mods: ModifierFunction[] = [];
  let rest = token.trim();
  for (;;) {
    const match = /^([A-Z]{2})\((.*)\)$/.exec(rest);
    if (!match?.[1] || match[2] === undefined || !MODIFIER_IDS.has(match[1])) break;
    mods.push(match[1] as ModifierFunction);
    rest = match[2].trim();
  }
  return /^\w+$/.test(rest) ? { mods, key: rest } : null;
}

export function formatKeyExpression({ mods, key }: KeyExpression): string {
  return mods.reduceRight((inner, mod) => `${mod}(${inner})`, key);
}

/** Keycap label for a keycode param, e.g. `LG(PG_UP)` → `Gui+PgUp`. */
export function keyExpressionLabel(token: string): string {
  const expression = parseKeyExpression(token);
  if (!expression) return token;
  const key = findKeycode(expression.key)?.label ?? expression.key;
  const mods = expression.mods.map((id) => MODIFIER_FUNCTIONS.find((m) => m.id === id)?.label ?? id);
  return [...mods, key].join('+');
}
