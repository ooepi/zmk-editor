import { describe, expect, it } from 'vitest';
import { decodeKey, encodeKey } from './usage.ts';

describe('encodeKey', () => {
  it('encodes plain keys, modifier functions and shifted keys like ZMK', () => {
    expect(encodeKey('A')).toBe(0x070004);
    expect(encodeKey('LS(A)')).toBe(((0x02 << 24) >>> 0) + 0x070004);
    expect(encodeKey('LC(LS(TAB))')).toBe(((0x03 << 24) >>> 0) + 0x07002b);
    expect(encodeKey('EXCL')).toBe(((0x02 << 24) >>> 0) + 0x07001e);
    expect(encodeKey('RG(A)')).toBe(((0x80 << 24) >>> 0) + 0x070004);
    expect(encodeKey('C_VOL_UP')).toBe(0x0c00e9);
  });

  it('returns undefined for anything that is not a known key', () => {
    expect(encodeKey('NOT_A_KEY')).toBeUndefined();
    expect(encodeKey('LS(NOPE)')).toBeUndefined();
    expect(encodeKey('HRML(A)')).toBeUndefined();
  });
});

describe('decodeKey', () => {
  it('round-trips keys, preferring the shortest name', () => {
    for (const token of ['A', 'LS(A)', 'LC(LS(TAB))', 'EXCL', 'C_VOL_UP', 'RG(A)']) {
      expect(decodeKey(encodeKey(token) ?? -1)).toBe(token);
    }
    expect(decodeKey(0x07002a)).toBe('BSPC');
  });

  it('returns undefined for a usage it does not know', () => {
    expect(decodeKey(0x07ffff)).toBeUndefined();
  });
});
