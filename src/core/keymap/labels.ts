import type { Binding, Layer } from './model.ts';

const SHORT: Record<string, string> = {
  ESCAPE: 'ESC',
  BACKSPACE: 'BSPC',
  BSPC: 'BSPC',
  DELETE: 'DEL',
  RETURN: 'ENTER',
  RET: 'ENTER',
  SPACE: 'SPC',
  LEFT_SHIFT: 'SHIFT',
  LSHIFT: 'SHIFT',
  LSHFT: 'SHIFT',
  RIGHT_SHIFT: 'SHIFT',
  RSHIFT: 'SHIFT',
  RSHFT: 'SHIFT',
  LEFT_CONTROL: 'CTRL',
  LCTRL: 'CTRL',
  RIGHT_CONTROL: 'CTRL',
  RCTRL: 'CTRL',
  LEFT_ALT: 'ALT',
  LALT: 'ALT',
  RIGHT_ALT: 'ALTGR',
  RALT: 'ALTGR',
  LEFT_GUI: 'GUI',
  LGUI: 'GUI',
  LEFT_WIN: 'GUI',
  RIGHT_GUI: 'GUI',
  RGUI: 'GUI',
  SEMICOLON: ';',
  SEMI: ';',
  COMMA: ',',
  PERIOD: '.',
  DOT: '.',
  SLASH: '/',
  BACKSLASH: '\\',
  MINUS: '-',
  EQUAL: '=',
  GRAVE: '`',
  TILDE: '~',
  SQT: "'",
  APOSTROPHE: "'",
  DOUBLE_QUOTES: '"',
  LEFT_BRACKET: '[',
  LBKT: '[',
  RIGHT_BRACKET: ']',
  RBKT: ']',
  LEFT_BRACE: '{',
  LBRC: '{',
  RIGHT_BRACE: '}',
  RBRC: '}',
  LEFT_PARENTHESIS: '(',
  LPAR: '(',
  RIGHT_PARENTHESIS: ')',
  RPAR: ')',
  UP_ARROW: 'UP',
  DOWN_ARROW: 'DOWN',
  LEFT_ARROW: 'LEFT',
  RIGHT_ARROW: 'RIGHT',
  PLUS: '+',
  ASTERISK: '*',
  STAR: '*',
  UNDER: '_',
  UNDERSCORE: '_',
  PIPE: '|',
  COLON: ':',
  QUESTION: '?',
  C_VOLUME_UP: 'VOL+',
  C_VOL_UP: 'VOL+',
  C_VOLUME_DOWN: 'VOL-',
  C_VOL_DN: 'VOL-',
  C_PLAY_PAUSE: 'PLAY',
  C_PP: 'PLAY',
  C_NEXT: 'NEXT',
  C_PREV: 'PREV',
};

const LAYER_BEHAVIORS = new Set(['mo', 'tog', 'to', 'sl', 'lt']);

function keyLabel(token: string): string {
  const number = /^N(\d)$/.exec(token);
  if (number?.[1]) return number[1];
  return SHORT[token] ?? token;
}

/**
 * A short label for the generated ASCII layer comments. Comments are ignored
 * on import, so this only has to read well. The UI uses the keycode catalog.
 */
export function bindingLabel(binding: Binding, layers: Layer[]): string {
  const { behavior, params } = binding;
  if (behavior === 'trans') return '';
  if (behavior === 'none') return 'xxx';
  if (behavior === 'kp' && params.length === 1 && params[0] !== undefined) return keyLabel(params[0]);
  if (LAYER_BEHAVIORS.has(behavior) && params[0] !== undefined) {
    const index = Number(params[0]);
    const layer = Number.isInteger(index) ? layers[index] : undefined;
    const name = layer ? (layer.displayName ?? layer.name) : params[0];
    const rest = params.slice(1).map(keyLabel);
    return behavior === 'mo' ? [name, ...rest].join(' ') : [behavior.toUpperCase(), name, ...rest].join(' ');
  }
  if (behavior === 'bt' && params[0] === 'BT_SEL' && params[1] !== undefined) return `BT${Number(params[1]) + 1}`;
  if (behavior === 'bt' && params[0] === 'BT_CLR') return 'BTCLR';
  return [behavior.toUpperCase(), ...params.map(keyLabel)].join(' ');
}
