import { describe, expect, it } from 'vitest';
import { definitionPath, parseHardware, serializeHardware } from './definition.ts';
import { DEFAULT_BASICS, gridHardware } from './grid.ts';
import { setRightWiredDifferently } from './wiring.ts';

const hw = { ...gridHardware({ ...DEFAULT_BASICS, name: 'test_split', displayName: 'Test Split', rows: 1, cols: 2 }), wiring: { kind: 'matrix' as const, diodeDirection: 'col2row' as const, rows: [4], cols: [6, 7] } };

describe('hardware definition file', () => {
  it('lives next to the shield files', () => {
    expect(definitionPath('test_split')).toBe('config/boards/shields/test_split/test_split.editor.json');
  });

  it('round-trips, with one key per line', () => {
    const text = serializeHardware(hw);
    expect(parseHardware(text)).toEqual(hw);
    expect(serializeHardware(parseHardware(text))).toBe(text);
    expect(text).toContain('\n    {"x":0,"y":0,"w":100,"h":100,"r":0,"rx":0,"ry":0,"row":0,"col":0,"side":"left"},\n');
    expect(text.startsWith('{\n  "version": 1,\n  "name": "test_split",')).toBe(true);
  });

  it('explains what is wrong with a bad file', () => {
    expect(() => parseHardware('nope')).toThrow();
    expect(() => parseHardware('{"version": 2}')).toThrow('version 2 isn’t supported; update the editor');
    expect(() => parseHardware(serializeHardware(hw).replace('"matrix"', '"charlieplex"'))).toThrow('wiring.kind must be matrix or direct');
  });
});

describe('hardware definition with encoders', () => {
  it('round-trips encoders, and leaves them out when there are none', () => {
    const withEncoders = { ...hw, encoders: [{ a: 8, b: 9 }], rightEncoders: [] };
    const text = serializeHardware(withEncoders);
    expect(parseHardware(text)).toEqual(withEncoders);
    expect(text).toContain('"encoders": [');
    expect(serializeHardware(hw)).not.toContain('ncoders');
  });
});

describe('hardware definition without encoders', () => {
  it('stays free of encoder keys when the right half gets its own pins', () => {
    expect(serializeHardware(setRightWiredDifferently(hw, true))).not.toContain('ncoders');
  });
});

