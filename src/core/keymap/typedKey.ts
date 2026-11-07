/**
 * The ZMK keycode for a key pressed on the computer's keyboard, by its position
 * (`KeyboardEvent.code`), not the character it types: ZMK sends positions and the
 * computer's layout decides the character, so Ö on a Finnish layout is `SEMI`.
 */

const NAMED: Record<string, string> = {
  Minus: 'MINUS',
  Equal: 'EQUAL',
  BracketLeft: 'LBKT',
  BracketRight: 'RBKT',
  Backslash: 'BSLH',
  Semicolon: 'SEMI',
  Quote: 'SQT',
  Backquote: 'GRAVE',
  Comma: 'COMMA',
  Period: 'DOT',
  Slash: 'FSLH',
  IntlBackslash: 'NUBS',
  IntlRo: 'INT1',
  IntlYen: 'INT3',
  Escape: 'ESC',
  Backspace: 'BSPC',
  Delete: 'DEL',
  Tab: 'TAB',
  Enter: 'RET',
  Space: 'SPACE',
  CapsLock: 'CAPS',
  PrintScreen: 'PSCRN',
  ScrollLock: 'SLCK',
  Pause: 'PAUSE_BREAK',
  Insert: 'INS',
  Home: 'HOME',
  End: 'END',
  PageUp: 'PG_UP',
  PageDown: 'PG_DN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ContextMenu: 'K_APP',
  NumLock: 'KP_NUM',
  NumpadDivide: 'KP_SLASH',
  NumpadMultiply: 'KP_MULTIPLY',
  NumpadSubtract: 'KP_MINUS',
  NumpadAdd: 'KP_PLUS',
  NumpadEnter: 'KP_ENTER',
  NumpadDecimal: 'KP_DOT',
  NumpadEqual: 'KP_EQUAL',
  NumpadComma: 'KP_COMMA',
  ShiftLeft: 'LSHFT',
  ShiftRight: 'RSHFT',
  ControlLeft: 'LCTRL',
  ControlRight: 'RCTRL',
  AltLeft: 'LALT',
  AltRight: 'RALT',
  MetaLeft: 'LGUI',
  MetaRight: 'RGUI',
};

/** Keys that already do something in the editor (deselect, clear, pan…); placed only with "Type all keys". */
export const SPECIAL_CODES: ReadonlySet<string> = new Set(['Escape', 'Backspace', 'Delete', 'Tab', 'Enter', 'Space']);

/** Shift, Ctrl, Alt and GUI: placed when pressed and released on their own. */
export const MODIFIER_CODES: ReadonlySet<string> = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
]);

/** `KeyA` → `A`, `Digit1` → `N1`, `F5` → `F5`, `Numpad7` → `KP_N7`, `Semicolon` → `SEMI`; null for keys ZMK has no name for here. */
export function keycodeForCode(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code)?.[1];
  if (letter) return letter;
  const digit = /^Digit([0-9])$/.exec(code)?.[1];
  if (digit) return `N${digit}`;
  const pad = /^Numpad([0-9])$/.exec(code)?.[1];
  if (pad) return `KP_N${pad}`;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return NAMED[code] ?? null;
}
