import { describe, expect, it } from 'vitest';
import { KEYCODE_DATA } from '../catalog/keycodes.data.ts';
import { keycodeForCode, MODIFIER_CODES, SPECIAL_CODES } from './typedKey.ts';

const known = new Set(KEYCODE_DATA.flatMap((k) => [k.name, ...k.aliases]));

const CODES = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => `Key${c}`),
  ...'0123456789'.split('').flatMap((d) => [`Digit${d}`, `Numpad${d}`]),
  ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
  'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote', 'Backquote', 'Comma', 'Period',
  'Slash', 'IntlBackslash', 'IntlRo', 'IntlYen', 'CapsLock', 'PrintScreen', 'ScrollLock', 'Pause', 'Insert', 'Home',
  'End', 'PageUp', 'PageDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ContextMenu', 'NumLock',
  'NumpadDivide', 'NumpadMultiply', 'NumpadSubtract', 'NumpadAdd', 'NumpadEnter', 'NumpadDecimal', 'NumpadEqual',
  'NumpadComma', ...SPECIAL_CODES, ...MODIFIER_CODES,
];

describe('keycodeForCode', () => {
  it('goes by position: letters, digits, F-keys and the numpad', () => {
    expect(keycodeForCode('KeyA')).toBe('A');
    expect(keycodeForCode('Digit1')).toBe('N1');
    expect(keycodeForCode('F12')).toBe('F12');
    expect(keycodeForCode('F24')).toBe('F24');
    expect(keycodeForCode('Numpad7')).toBe('KP_N7');
  });

  it('gives the Nordic letters their US positions', () => {
    expect(keycodeForCode('Semicolon')).toBe('SEMI'); // Ö
    expect(keycodeForCode('Quote')).toBe('SQT'); // Ä
    expect(keycodeForCode('BracketLeft')).toBe('LBKT'); // Å
    expect(keycodeForCode('IntlBackslash')).toBe('NUBS'); // <>
  });

  it('names the special keys and modifiers', () => {
    expect(keycodeForCode('Escape')).toBe('ESC');
    expect(keycodeForCode('Space')).toBe('SPACE');
    expect(keycodeForCode('ShiftLeft')).toBe('LSHFT');
    expect(keycodeForCode('AltRight')).toBe('RALT');
  });

  it('returns null for keys it has no name for', () => {
    expect(keycodeForCode('F25')).toBeNull();
    expect(keycodeForCode('Fn')).toBeNull();
    expect(keycodeForCode('')).toBeNull();
  });

  it.each(CODES)('maps %s to a keycode ZMK knows', (code) => {
    const token = keycodeForCode(code);
    expect(token).not.toBeNull();
    expect(known.has(token as string)).toBe(true);
  });
});
