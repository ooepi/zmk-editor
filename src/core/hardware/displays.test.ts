import { describe, expect, it } from 'vitest';
import { DISPLAYS, halfDisplay, hasDisplay, setDisplay } from './displays.ts';
import { testPad, testSplit } from './testFixtures.ts';
import { pinUses } from './wiring.ts';

describe('displays', () => {
  it('uses the standard pins: nice!view D1/D2/D3, OLEDs D2/D3', () => {
    expect(DISPLAYS.nice_view.pins.map((p) => p.pin)).toEqual([1, 2, 3]);
    expect(DISPLAYS.oled_128x32.pins).toEqual([{ pin: 2, use: 'Display SDA' }, { pin: 3, use: 'Display SCL' }]);
    expect(DISPLAYS.oled_128x64.pins.map((p) => p.pin)).toEqual([2, 3]);
  });

  it('sets a display per half; a one-piece keyboard uses the left slot', () => {
    const split = setDisplay(setDisplay(testSplit, 'left', 'nice_view'), 'right', 'oled_128x32');
    expect(halfDisplay(split, 'left')).toBe('nice_view');
    expect(halfDisplay(split, 'right')).toBe('oled_128x32');
    expect(hasDisplay(split)).toBe(true);
    const pad = setDisplay(testPad, undefined, 'oled_128x64');
    expect(halfDisplay(pad)).toBe('oled_128x64');
    // Removing the last display removes the field, so files without displays don't change.
    expect(setDisplay(pad, undefined, undefined)).not.toHaveProperty('displays');
    expect(hasDisplay(testPad)).toBe(false);
  });

  it('lists display pins among the pin uses of their half', () => {
    const split = setDisplay(testSplit, 'right', 'nice_view');
    expect(pinUses(split, 'right').get(1)).toEqual(['Display CS']);
    expect(pinUses(split, 'left').get(1)).toBeUndefined();
  });
});
