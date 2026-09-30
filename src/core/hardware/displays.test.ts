import { describe, expect, it } from 'vitest';
import {
  clearDisplayPins,
  defaultDisplayPins,
  halfDisplay,
  halfDisplayPins,
  hasDisplay,
  setDisplay,
  setDisplayPin,
  usesNiceViewAdapter,
} from './displays.ts';
import { PRO_MICRO, SEEED_XIAO } from './interconnects.ts';
import { testPad, testSplit } from './testFixtures.ts';
import { pinUses } from './wiring.ts';

describe('displays', () => {
  it('defaults to the standard pins: nice!view D1/D2/D3 (XIAO D9/D10/D8), OLEDs on the controller’s I2C pins', () => {
    expect(defaultDisplayPins('nice_view', PRO_MICRO)).toEqual([
      { signal: 'cs', pin: 1, use: 'Display CS' },
      { signal: 'data', pin: 2, use: 'Display data' },
      { signal: 'clock', pin: 3, use: 'Display clock' },
    ]);
    expect(defaultDisplayPins('nice_view', SEEED_XIAO).map((p) => p.pin)).toEqual([9, 10, 8]);
    expect(defaultDisplayPins('oled_128x32', PRO_MICRO).map((p) => p.pin)).toEqual([2, 3]);
    expect(defaultDisplayPins('oled_128x64', SEEED_XIAO)).toEqual([
      { signal: 'sda', pin: 4, use: 'Display SDA' },
      { signal: 'scl', pin: 5, use: 'Display SCL' },
    ]);
  });

  it('keeps only the pins that differ from the defaults, per half', () => {
    const view = setDisplay(testSplit, 'left', 'nice_view');
    const moved = setDisplayPin(view, 'left', 'cs', 5);
    expect(moved.displayPins).toEqual({ left: { cs: 5 } });
    expect(halfDisplayPins(moved, 'left').map((p) => p.pin)).toEqual([5, 2, 3]);
    expect(halfDisplayPins(moved, 'right')).toEqual([]);
    expect(setDisplayPin(moved, 'left', 'cs', 1)).not.toHaveProperty('displayPins');
    expect(clearDisplayPins(moved, 'left')).not.toHaveProperty('displayPins');
    expect(setDisplayPin(moved, 'left', 'data', null).displayPins).toEqual({ left: { cs: 5, data: null } });
  });

  it('ignores pins for signals the half’s display doesn’t have', () => {
    const oled = setDisplay(testSplit, 'left', 'oled_128x32');
    expect(setDisplayPin(oled, 'left', 'cs', 5)).toBe(oled);
    expect(setDisplayPin(testSplit, 'left', 'sda', 5)).toBe(testSplit);
  });

  it('drops a half’s pins when its display changes', () => {
    const moved = setDisplayPin(setDisplay(testSplit, 'left', 'nice_view'), 'left', 'cs', 5);
    expect(setDisplay(moved, 'left', 'oled_128x32')).not.toHaveProperty('displayPins');
    expect(setDisplay(moved, 'right', 'oled_128x32').displayPins).toEqual({ left: { cs: 5 } });
  });

  it('uses ZMK’s nice!view adapter only for a Pro Micro nice!view on its standard pins', () => {
    const view = setDisplay(testSplit, 'left', 'nice_view');
    expect(usesNiceViewAdapter(view, 'left')).toBe(true);
    expect(usesNiceViewAdapter(view, 'right')).toBe(false);
    expect(usesNiceViewAdapter(setDisplayPin(view, 'left', 'cs', 5), 'left')).toBe(false);
    expect(usesNiceViewAdapter({ ...view, controller: 'seeeduino_xiao_ble' }, 'left')).toBe(false);
    expect(usesNiceViewAdapter(setDisplay(testSplit, 'left', 'oled_128x32'), 'left')).toBe(false);
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
