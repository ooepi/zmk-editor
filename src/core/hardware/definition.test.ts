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
    expect(() => parseHardware('{"version": 3}')).toThrow('version 3 isn’t supported; update the editor');
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

describe('hardware definition with displays', () => {
  it('round-trips displays and leaves them out when there are none', () => {
    const withDisplays = { ...hw, displays: { left: 'nice_view' as const, right: 'oled_128x64' as const } };
    expect(parseHardware(serializeHardware(withDisplays))).toEqual(withDisplays);
    expect(serializeHardware(hw)).not.toContain('displays');
    expect(() => parseHardware(serializeHardware(withDisplays).replace('"oled_128x64"', '"crt"'))).toThrow('displays.right must be one of nice_view, oled_128x32, oled_128x64');
  });
});

describe('display pins in the definition', () => {
  const withView = { ...hw, displays: { left: 'nice_view' as const, right: 'oled_128x32' as const } };

  it('round-trips them as version 2, and stays version 1 without them', () => {
    const moved = { ...withView, displayPins: { left: { cs: 5 }, right: { sda: 6, scl: 7 } } };
    const text = serializeHardware(moved);
    expect(text).toContain('"version": 2,');
    expect(text).toContain('"displayPins": {');
    expect(parseHardware(text)).toEqual(moved);
    expect(serializeHardware(withView)).toContain('"version": 1,');
  });

  it('drops empty display pins, so the file stays version 1', () => {
    const text = serializeHardware(withView).replace('"displays": {', '"displayPins": { "left": {} },\n  "displays": {');
    const parsed = parseHardware(text);
    expect(parsed).not.toHaveProperty('displayPins');
    expect(serializeHardware(parsed)).toContain('"version": 1,');
  });

  it('rejects unknown signals and pins that aren’t numbers', () => {
    const text = serializeHardware({ ...withView, displayPins: { left: { cs: 5 } } });
    expect(() => parseHardware(text.replace('"cs"', '"foo"'))).toThrow('displayPins.left.foo isn’t a display signal');
    expect(() => parseHardware(text.replace('"cs": 5', '"cs": "x"'))).toThrow('displayPins.left.cs must be a number');
  });
});

describe('encoder knob positions in the definition', () => {
  it('round-trip, and are left out when there are none', () => {
    const withKnobs = { ...hw, encoders: [{ a: 2, b: 3 }], encoderSpots: [{ x: 150, y: 250 }, null] };
    expect(parseHardware(serializeHardware(withKnobs))).toEqual(withKnobs);
    expect(serializeHardware({ ...hw, encoderSpots: [null] })).not.toContain('encoderSpots');
  });
});

describe('a bad knob position in the definition', () => {
  it('is dropped rather than losing the whole keyboard', () => {
    const text = serializeHardware({ ...hw, encoders: [{ a: 2, b: 3 }], encoderSpots: [{ x: 150, y: 250 }] }).replace('"x": 150', '"x": "150"');
    expect(parseHardware(text).encoderSpots).toEqual([null]);
  });
});
