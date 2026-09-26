import { describe, expect, it } from 'vitest';
import { findKeycode, formatKeyExpression, keyExpressionLabel, parseKeyExpression, searchKeycodes } from './keycodes.ts';

describe('findKeycode', () => {
  it('finds a keycode by canonical name, alias or deprecated alias', () => {
    expect(findKeycode('NUMBER_1')?.name).toBe('NUMBER_1');
    expect(findKeycode('N1')?.name).toBe('NUMBER_1');
    expect(findKeycode('NUM_1')?.name).toBe('NUMBER_1');
    expect(findKeycode('nope')).toBeUndefined();
  });

  it('gives short keycap labels', () => {
    const label = (t: string) => findKeycode(t)?.label;
    expect(label('A')).toBe('A');
    expect(label('N1')).toBe('1');
    expect(label('EXCL')).toBe('!');
    expect(label('SEMI')).toBe(';');
    expect(label('BSPC')).toBe('Bksp');
    expect(label('ESC')).toBe('Esc');
    expect(label('LSHFT')).toBe('Shift');
    expect(label('UP_ARROW')).toBe('↑');
    expect(label('PG_UP')).toBe('PgUp');
    expect(label('C_VOL_UP')).toBe('Vol+');
    expect(label('KP_N1')).toBe('KP 1');
    expect(label('F11')).toBe('F11');
    expect(label('CAPS')).toBe('Caps Lock');
    expect(label('LPAR')).toBe('(');
    expect(label('KP_LEFT_PARENTHESIS')).toBe('KP (');
  });

  it('puts keycodes in categories', () => {
    const category = (t: string) => findKeycode(t)?.category;
    expect(category('A')).toBe('letters');
    expect(category('N1')).toBe('numbers');
    expect(category('EXCL')).toBe('symbols');
    expect(category('COMMA')).toBe('symbols');
    expect(category('F5')).toBe('function');
    expect(category('LSHFT')).toBe('modifiers');
    expect(category('HOME')).toBe('navigation');
    expect(category('SPACE')).toBe('basic');
    expect(category('KP_N1')).toBe('keypad');
    expect(category('C_VOL_UP')).toBe('media');
  });
});

describe('searchKeycodes', () => {
  it('ranks exact names and aliases first', () => {
    expect(searchKeycodes('esc')[0]?.name).toBe('ESCAPE');
    expect(searchKeycodes('n1')[0]?.name).toBe('NUMBER_1');
    expect(searchKeycodes('!')[0]?.name).toBe('EXCLAMATION');
  });

  it('matches descriptions', () => {
    expect(searchKeycodes('volume').map((k) => k.name)).toContain('C_VOLUME_UP');
  });

  it('lists common keys first when there is no query', () => {
    expect(searchKeycodes('').slice(0, 3).map((k) => k.name)).toEqual(['A', 'B', 'C']);
  });

  it('filters by category', () => {
    const results = searchKeycodes('', 'function');
    expect(results.length).toBeGreaterThanOrEqual(24);
    expect(results.every((k) => k.category === 'function')).toBe(true);
  });
});

describe('key expressions', () => {
  it('parses nested modifier functions', () => {
    expect(parseKeyExpression('LA(LC(TAB))')).toEqual({ mods: ['LA', 'LC'], key: 'TAB' });
    expect(parseKeyExpression('A')).toEqual({ mods: [], key: 'A' });
    expect(parseKeyExpression('(A)')).toBeNull();
  });

  it('formats them back', () => {
    expect(formatKeyExpression({ mods: ['LA', 'LC'], key: 'TAB' })).toBe('LA(LC(TAB))');
    expect(formatKeyExpression({ mods: [], key: 'A' })).toBe('A');
  });

  it('labels them for keycaps', () => {
    expect(keyExpressionLabel('LG(PG_UP)')).toBe('Gui+PgUp');
    expect(keyExpressionLabel('LA(LC(TAB))')).toBe('Alt+Ctl+Tab');
    expect(keyExpressionLabel('UNKNOWN_THING')).toBe('UNKNOWN_THING');
  });
});
