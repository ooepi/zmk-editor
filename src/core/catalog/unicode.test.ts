import { describe, expect, it } from 'vitest';
import { findUnicodeAlias, parseUnicodeParams, searchUnicode, unicodeLabel } from './unicode.ts';

describe('unicode catalog', () => {
  it('finds aliases with their characters', () => {
    expect(findUnicodeAlias('UC_SV_AE')).toMatchObject({ language: 'swedish', char: 'ä', shifted: 'Ä' });
  });

  it('searches by character, name and language', () => {
    expect(searchUnicode('ö')[0]?.char).toBe('ö');
    expect(searchUnicode('sv_ao')[0]?.name).toBe('UC_SV_AO');
    expect(searchUnicode('', 'swedish').map((a) => a.name)).toEqual(['UC_SV_AE', 'UC_SV_AO', 'UC_SV_OE']);
  });

  it('puts preferred languages first', () => {
    expect(searchUnicode('ä', undefined, ['swedish'])[0]?.name).toBe('UC_SV_AE');
  });

  it('understands aliases, code points and mode switches', () => {
    expect(parseUnicodeParams(['UC_SV_OE'])).toEqual({ kind: 'char', char: 'ö', shifted: 'Ö' });
    expect(parseUnicodeParams(['0xE4', '0xC4'])).toEqual({ kind: 'char', char: 'ä', shifted: 'Ä' });
    expect(parseUnicodeParams(['0x1F609', '0'])).toEqual({ kind: 'char', char: '😉', shifted: '😉' });
    expect(parseUnicodeParams(['UC_SET_MACOS'])).toEqual({ kind: 'mode', mode: 'UC_MODE_MACOS' });
    expect(parseUnicodeParams(['WHAT'])).toBeNull();
  });

  it('labels keys', () => {
    expect(unicodeLabel(['UC_SV_OE'])).toEqual({ main: 'ö', sub: 'Ö' });
    expect(unicodeLabel(['0xE4', '0'])).toEqual({ main: 'ä' });
    expect(unicodeLabel(['UC_SET_WIN_COMPOSE'])).toEqual({ main: 'WinCompose', sub: 'uc mode' });
  });
});
