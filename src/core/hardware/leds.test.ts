import { describe, expect, it } from 'vitest';
import { DEFAULT_BASICS, gridHardware } from './grid.ts';
import { BOARD_POWER, halfLeds, hasBacklight, hasUnderglow, ledSummary, setBacklight, setLedCount, setLedPin, setUnderglow } from './leds.ts';
import { testLedPad, testLedSplit } from './testFixtures.ts';
import { pinUses, setPin, setRightWiredDifferently } from './wiring.ts';

const onePiece = gridHardware({ ...DEFAULT_BASICS, name: 'blank', displayName: 'Blank', split: false, rows: 2, cols: 3 });

describe('LEDs per half', () => {
  it('mirrors the left half’s LEDs on a mirrored right half, and copies them when it’s wired differently', () => {
    expect(halfLeds(testLedSplit, 'right')).toEqual(testLedSplit.leds);
    const own = setRightWiredDifferently(testLedSplit, true);
    expect(own.rightLeds).toEqual(testLedSplit.leds);
    expect(setRightWiredDifferently(own, false).rightLeds).toBeUndefined();
  });

  it('turns underglow and backlight on with no pin yet', () => {
    expect(setUnderglow(onePiece, undefined, true).leds).toEqual({ underglow: { data: null, count: 1 } });
    expect(setBacklight(onePiece, undefined, true).leds).toEqual({ backlight: { pin: null } });
    expect(setLedCount(setUnderglow(onePiece, undefined, true), undefined, 20).leds?.underglow?.count).toBe(20);
  });

  it('gives a mirrored right half its own LEDs when one of its pins is set', () => {
    const hw = setLedPin(testLedSplit, 'right', 'data', 21);
    expect(hw.rightLeds?.underglow?.data).toBe(21);
    expect(hw.leds?.underglow?.data).toBe(9);
  });

  it('drops the whole block, power pin included, when both kinds are off', () => {
    const hw = setBacklight(setUnderglow(testLedSplit, 'left', false), 'left', false);
    expect(hw.leds).toBeUndefined();
    expect(hasUnderglow(hw)).toBe(false);
    expect(hasBacklight(hw)).toBe(false);
  });

  it('lists its pins in pin uses, and sets them through setPin', () => {
    expect(pinUses(testLedPad).get(10)).toEqual(['LED data']);
    expect(pinUses(testLedPad).get(9)).toEqual(['LED power']);
    expect(pinUses(testLedSplit, 'right').get(9)).toEqual(['LED data']);
    expect(setPin(testLedPad, undefined, 'led.power', 0, 21).leds?.power).toBe(21);
  });

  it('summarises them', () => {
    expect(ledSummary(testLedPad)).toBe('20 RGB LEDs on D10, power switch on D9');
    expect(ledSummary(testLedSplit)).toBe('6 RGB LEDs on D9, backlight on D10, power switch on D8');
    expect(ledSummary(onePiece)).toBeUndefined();
  });

  it('knows each board’s own 3.3V switch', () => {
    expect(BOARD_POWER.nice_nano).toEqual({ gpio: 'gpio0', pin: 13, flags: 'GPIO_ACTIVE_LOW' });
    expect(BOARD_POWER.nice_nano_v2).toEqual({ gpio: 'gpio0', pin: 13, flags: 'GPIO_ACTIVE_HIGH' });
    expect(BOARD_POWER.seeeduino_xiao_ble).toBeUndefined();
  });
});
