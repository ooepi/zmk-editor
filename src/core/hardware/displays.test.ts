import { describe, expect, it } from 'vitest';
import { availableDisplays, displayPins, halfDisplay, hasDisplay, setDisplay } from './displays.ts';
import { PRO_MICRO, SEEED_XIAO } from './interconnects.ts';
import { testPad, testSplit } from './testFixtures.ts';
import { pinUses } from './wiring.ts';

describe('displays', () => {
  it('uses the standard pins: nice!view D1/D2/D3, OLEDs on the controller’s I2C pins', () => {
    expect(displayPins('nice_view', PRO_MICRO).map((p) => p.pin)).toEqual([1, 2, 3]);
    expect(displayPins('oled_128x32', PRO_MICRO)).toEqual([{ pin: 2, use: 'Display SDA' }, { pin: 3, use: 'Display SCL' }]);
    expect(displayPins('oled_128x64', PRO_MICRO).map((p) => p.pin)).toEqual([2, 3]);
    expect(displayPins('oled_128x64', SEEED_XIAO)).toEqual([{ pin: 4, use: 'Display SDA' }, { pin: 5, use: 'Display SCL' }]);
  });

  it('offers a nice!view only where ZMK’s adapter fits', () => {
    expect(availableDisplays(PRO_MICRO)).toEqual(['nice_view', 'oled_128x32', 'oled_128x64']);
    expect(availableDisplays(SEEED_XIAO)).toEqual(['oled_128x32', 'oled_128x64']);
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
    const xiao = setDisplay({ ...testSplit, controller: 'seeeduino_xiao_ble' }, 'left', 'oled_128x32');
    expect(pinUses(xiao, 'left').get(4)).toEqual(['Row 0', 'Display SDA']);
    expect(pinUses(xiao, 'left').get(5)).toEqual(['Display SCL']);
  });
});
