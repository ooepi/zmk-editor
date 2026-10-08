import { describe, expect, it } from 'vitest';
import { setDisplay, setDisplayPin, usesNiceViewAdapter } from './displays.ts';
import { DEFAULT_BASICS, gridHardware } from './grid.ts';
import {
  controllerPin,
  drivenList,
  isShiftOutput,
  outputLabel,
  outputUses,
  setShiftOwnBus,
  setShiftPin,
  setShiftRegisterCount,
  shiftPins,
  shiftSummary,
} from './shiftRegisters.ts';
import { testShiftPad } from './testFixtures.ts';
import type { KeyboardHardware } from './types.ts';
import { pinUses, setPin } from './wiring.ts';

const blank = (cols: number, diodeDirection: 'col2row' | 'row2col' = 'col2row'): KeyboardHardware => ({
  ...gridHardware({ ...DEFAULT_BASICS, name: 'blank', displayName: 'Blank', split: false, rows: 3, cols, diodeDirection }),
});

describe('outputLabel', () => {
  it('numbers outputs from the register wired to the controller', () => {
    expect(outputLabel(0)).toBe('Output 0 (U1 QA)');
    expect(outputLabel(7)).toBe('Output 7 (U1 QH)');
    expect(outputLabel(9)).toBe('Output 9 (U2 QB)');
    expect(outputLabel(31)).toBe('Output 31 (U4 QH)');
  });
});

describe('setShiftRegisterCount', () => {
  it('fills the driven lines in order when turned on, keeping the rest', () => {
    const hw = setShiftRegisterCount(blank(10), 1);
    expect(hw.shiftRegisters).toEqual({ count: 1, latch: null });
    expect(hw.wiring.kind === 'matrix' && hw.wiring.cols).toEqual([...Array.from({ length: 8 }, (_, i) => ({ sr: i })), null, null]);
    expect(hw.wiring.kind === 'matrix' && hw.wiring.rows).toEqual([null, null, null]);
  });

  it('drives rows on ROW2COL', () => {
    const hw = setShiftRegisterCount(blank(4, 'row2col'), 1);
    expect(drivenList(hw)).toBe('rows');
    expect(hw.wiring.kind === 'matrix' && hw.wiring.rows).toEqual([{ sr: 0 }, { sr: 1 }, { sr: 2 }]);
  });

  it('keeps hand-picked pins when going 2 → 1 → 2, and clears outputs that no longer exist', () => {
    let hw = setShiftRegisterCount(blank(18), 2);
    hw = setPin(hw, undefined, 'cols', 17, 21);
    hw = setShiftRegisterCount(hw, 1);
    const cols1 = hw.wiring.kind === 'matrix' ? hw.wiring.cols : [];
    expect(cols1.slice(0, 8)).toEqual(Array.from({ length: 8 }, (_, i) => ({ sr: i })));
    expect(cols1.slice(8, 16)).toEqual(Array(8).fill(null));
    expect(cols1[17]).toBe(21);
    hw = setShiftRegisterCount(hw, 2);
    const cols2 = hw.wiring.kind === 'matrix' ? hw.wiring.cols : [];
    expect(cols2.slice(0, 16)).toEqual(Array.from({ length: 16 }, (_, i) => ({ sr: i })));
    expect(cols2[17]).toBe(21);
  });

  it('turns off: every output goes back to no pin and the block is removed', () => {
    const hw = setShiftRegisterCount(testShiftPad, 0);
    expect(hw.shiftRegisters).toBeUndefined();
    expect(hw.wiring.kind === 'matrix' && hw.wiring.cols).toEqual([...Array(8).fill(null), 6, 7]);
  });

  it('does nothing on a split keyboard', () => {
    const split = gridHardware({ ...DEFAULT_BASICS, rows: 1, cols: 2 });
    expect(setShiftRegisterCount(split, 1)).toBe(split);
  });
});

describe('shiftPins', () => {
  it('uses the controller’s SPI pins by default', () => {
    expect(shiftPins(testShiftPad)).toEqual({ latch: 8, data: 2, clock: 3, shared: false });
  });

  it('uses moved pins, and forgets a pin moved back to its default', () => {
    let hw = setShiftPin(testShiftPad, 'data', 19);
    hw = setShiftPin(hw, 'clock', 20);
    expect(shiftPins(hw)).toEqual({ latch: 8, data: 19, clock: 20, shared: false });
    expect(setShiftPin(hw, 'data', 2).shiftRegisters).toEqual({ count: 1, latch: 8, clock: 20 });
  });

  it('shares a nice!view’s data and clock, and stops using the adapter', () => {
    const hw = setDisplayPin(setDisplay(testShiftPad, undefined, 'nice_view'), undefined, 'data', 9);
    expect(shiftPins(hw)).toEqual({ latch: 8, data: 9, clock: 3, shared: true });
    expect(usesNiceViewAdapter(setDisplay(testShiftPad, undefined, 'nice_view'))).toBe(false);
    // Moving the shift registers' own pins is ignored while the bus is shared.
    expect(setShiftPin(hw, 'data', 19)).toBe(hw);
  });

  it('gets its own pins next to a nice!view with ownBus, and the adapter stays', () => {
    const hw = setShiftPin(setShiftOwnBus(setDisplay(testShiftPad, undefined, 'nice_view'), true), 'data', 19);
    expect(hw.shiftRegisters?.ownBus).toBe(true);
    expect(shiftPins(hw)).toEqual({ latch: 8, data: 19, clock: 3, shared: false });
    expect(usesNiceViewAdapter(hw)).toBe(true);
    expect(setShiftOwnBus(hw, false).shiftRegisters).toEqual({ count: 1, latch: 8, data: 19 });
  });
});

describe('pin uses and summaries', () => {
  it('lists the latch, data and clock, and leaves outputs off the controller', () => {
    const uses = pinUses(testShiftPad);
    expect(uses.get(8)).toEqual(['Shift register latch']);
    expect(uses.get(2)).toEqual(['Shift register data']);
    expect(uses.get(3)).toEqual(['Shift register clock']);
    expect(uses.get(6)).toEqual(['Column 8']);
    expect(uses.get(0)).toBeUndefined();
  });

  it('shows both uses on a shared pin', () => {
    expect(pinUses(setDisplay(testShiftPad, undefined, 'nice_view')).get(2)).toEqual(['Display data', 'Shift register data']);
  });

  it('knows which lines use each output', () => {
    const hw = setPin(testShiftPad, undefined, 'cols', 9, { sr: 3 });
    expect(outputUses(hw).get(3)).toEqual(['Column 3', 'Column 9']);
    expect(outputUses(hw).get(0)).toEqual(['Column 0']);
  });

  it('sets the latch through setPin, like other pin fields', () => {
    expect(setPin(testShiftPad, undefined, 'shift.latch', 0, 21).shiftRegisters?.latch).toBe(21);
  });

  it('summarises which lines use outputs', () => {
    expect(shiftSummary(testShiftPad)).toBe('Columns 0–7 on 1 shift register (74HC595)');
    expect(shiftSummary(setPin(testShiftPad, undefined, 'cols', 9, { sr: 3 }))).toBe('Columns 0–7, 9 on 1 shift register (74HC595)');
    expect(shiftSummary(setShiftRegisterCount(testShiftPad, 0))).toBeUndefined();
  });

  it('tells outputs from pins', () => {
    expect(isShiftOutput({ sr: 0 })).toBe(true);
    expect(isShiftOutput(null)).toBe(false);
    expect(controllerPin({ sr: 2 })).toBeNull();
    expect(controllerPin(5)).toBe(5);
  });
});
