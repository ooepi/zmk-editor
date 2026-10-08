import { describe, expect, it } from 'vitest';
import { DEFAULT_BASICS, gridHardware } from './grid.ts';
import { setShiftOwnBus } from './shiftRegisters.ts';
import { testShiftPad } from './testFixtures.ts';
import type { KeyboardHardware, MatrixWiring } from './types.ts';
import { setDisplay, setDisplayPin } from './displays.ts';
import { hasErrors, validateBasics, validateHardware } from './validate.ts';
import { setPin } from './wiring.ts';

const basics = { ...DEFAULT_BASICS, name: 'test_split', displayName: 'Test Split', rows: 2, cols: 3 };

function wired(): KeyboardHardware {
  return { ...gridHardware(basics), wiring: { kind: 'matrix', diodeDirection: 'col2row', rows: [4, 5], cols: [6, 7, 8] } };
}

const messages = (hw: KeyboardHardware, level: 'error' | 'warning' = 'error') =>
  validateHardware(hw).filter((i) => i.level === level).map((i) => i.message);

describe('validateHardware', () => {
  it('accepts a fully wired split', () => {
    expect(validateHardware(wired())).toEqual([]);
  });

  it('checks the id, name and controller', () => {
    expect(messages({ ...wired(), name: '2cool' })).toEqual(['The id “2cool” must start with a letter and use only a–z, 0–9 and _.']);
    expect(messages({ ...wired(), name: 'corne' })).toEqual(['“corne” is already a keyboard in ZMK; pick another id.']);
    expect(messages({ ...wired(), displayName: 'A very long keyboard' })).toEqual([
      'The name “A very long keyboard” is longer than 16 characters, the Bluetooth limit.',
    ]);
    expect(messages({ ...wired(), displayName: 'Say "hi"' })).toEqual(['The name can’t contain " or \\.']);
    expect(messages({ ...wired(), controller: 'sparkfun_pro_micro_rp2040' })).toEqual([
      'sparkfun_pro_micro_rp2040 isn’t a supported controller.',
    ]);
  });

  it('rejects a display name with non-ASCII characters or $, since it becomes the Bluetooth name', () => {
    const message = 'The name can only use plain letters, digits, spaces and punctuation (no accents or $), because it becomes the Bluetooth name.';
    expect(messages({ ...wired(), displayName: 'Këyböard' })).toEqual([message]);
    expect(messages({ ...wired(), displayName: 'K$(id)' })).toEqual([message]);
    expect(messages({ ...wired(), displayName: 'Test Split 2!' })).toEqual([]);
  });

  it('reserves ZMK and module shield ids, in addition to catalog keyboards', () => {
    for (const id of ['nice_view', 'nice_view_adapter', 'settings_reset', 'studio_rpc_usb_uart', 'nice_view_gem']) {
      expect(messages({ ...wired(), name: id })).toEqual([`“${id}” is already used by ZMK or a module; pick another id.`]);
    }
  });

  it('finds missing, invalid and repeated pins', () => {
    const hw = wired();
    expect(messages({ ...hw, wiring: { kind: 'matrix', diodeDirection: 'col2row', rows: [4, null], cols: [6, 11, 4] } })).toEqual([
      'Row 1 on the left half has no pin.',
      'Column 1 on the left half uses D11, which isn’t a Pro Micro pin.',
      'D4 is used for both Row 0 and Column 2 on the left half.',
    ]);
  });

  it('checks the right half separately when it has its own pins', () => {
    const hw = wired();
    const right = { ...hw, wiring: { kind: 'matrix' as const, diodeDirection: 'col2row' as const, rows: [4, 5], cols: [6, 7, 8], right: { rows: [4, 5], cols: [6, 6, 8] } } };
    expect(messages(right)).toEqual(['D6 is used for both Column 0 and Column 1 on the right half.']);
  });

  it('finds keys outside the matrix, clashing keys and keys without a half', () => {
    const hw = wired();
    const keys = hw.keys.map((k, i) => {
      if (i === 1) return { ...k, col: 0 };
      if (i === 2) return { ...k, row: 5 };
      if (i === 3) return { x: k.x, y: k.y, w: k.w, h: k.h, r: k.r, rx: k.rx, ry: k.ry, row: k.row, col: k.col };
      return k;
    });
    const issues = validateHardware({ ...hw, keys }).filter((i) => i.level === 'error');
    // Keys are checked in order: key 1 clashes with key 0 before key 2 is found outside the matrix.
    expect(issues.map((i) => i.message)).toEqual([
      'Keys 0 and 1 are both on row 0, column 0 on the left half.',
      'Key 2 is on row 5, column 2 on the left half, outside the 2 × 3 matrix.',
      'Key 3 isn’t on a half.',
    ]);
    expect(issues[0]?.keys).toEqual([0, 1]);
  });

  it('warns about unused rows, columns and inputs', () => {
    const hw = wired();
    expect(messages({ ...hw, keys: hw.keys.filter((k) => !(k.side === 'left' && k.col === 2)) }, 'warning')).toEqual([
      'Column 2 on the left half has no keys.',
    ]);
    const pad: KeyboardHardware = {
      ...hw,
      split: false,
      wiring: { kind: 'direct', pins: [4, 5] },
      keys: [{ x: 0, y: 0, w: 100, h: 100, r: 0, rx: 0, ry: 0, row: 0, col: 0 }],
    };
    expect(messages(pad, 'warning')).toEqual(['Input 1 has no key.']);
    expect(hasErrors(validateHardware(pad))).toBe(false);
  });
  it('checks encoder pins like any other pin', () => {
    const hw = wired();
    expect(messages({ ...hw, encoders: [{ a: 10, b: null }] })).toEqual(['Encoder 0 B on the left half has no pin.']);
    expect(messages({ ...hw, encoders: [{ a: 4, b: 9 }] })).toEqual(['D4 is used for both Row 0 and Encoder 0 A on the left half.']);
    // The right half's own encoders are checked on their own.
    const right = { ...hw, wiring: { ...hw.wiring, right: { rows: [4, 5], cols: [6, 7, 8] } }, rightEncoders: [{ a: 6, b: 9 }] } as KeyboardHardware;
    expect(messages(right)).toEqual(['D6 is used for both Column 0 and Encoder 0 A on the right half.']);
    expect(validateHardware({ ...hw, encoders: [{ a: 10, b: 14 }] })).toEqual([]);
  });
  it('checks display pins against the other pins of their half', () => {
    const hw = wired(); // rows [4, 5], cols [6, 7, 8]
    expect(messages(setDisplay(hw, 'left', 'oled_128x32'))).toEqual([]);
    const clash = { ...hw, encoders: [{ a: 2, b: 9 }] };
    expect(messages(setDisplay(clash, 'left', 'oled_128x32'))).toEqual(['D2 is used for both Encoder 0 A and Display SDA on the left half.']);
    // A mirrored right half is still checked when it has a display of its own.
    const rightOnly = { ...hw, wiring: { kind: 'matrix' as const, diodeDirection: 'col2row' as const, rows: [1, 5], cols: [6, 7, 8] } };
    expect(messages(setDisplay(rightOnly, 'right', 'nice_view'))).toEqual(['D1 is used for both Row 0 and Display CS on the right half.']);
  });
});

describe('validateBasics', () => {
  it('stops a matrix that needs more pins than the controller has', () => {
    expect(validateBasics({ ...basics, rows: 6, cols: 14 }).map((i) => i.message)).toEqual([
      'A 6 × 14 matrix needs 20 pins per half, but a Pro Micro has 18.',
    ]);
    expect(validateBasics({ ...basics, wiring: 'direct', split: false, rows: 4, cols: 5 }).map((i) => i.message)).toEqual([
      'Direct wiring for 20 keys needs 20 pins, but a Pro Micro has 18.',
    ]);
    expect(validateBasics({ ...basics, rows: 0 }).map((i) => i.message)).toEqual(['Use at least 1 row.']);
  });

  it('counts the Seeed XIAO’s 11 pins, and says what to do', () => {
    const xiao = { ...basics, controller: 'seeeduino_xiao_ble' };
    expect(validateBasics({ ...xiao, rows: 5, cols: 6 })).toEqual([]);
    expect(validateBasics({ ...xiao, rows: 6, cols: 7 }).map((i) => i.message)).toEqual([
      'A 6 × 7 matrix needs 13 pins per half, but a Seeed XIAO has 11. Use fewer rows or columns, or a Pro Micro controller.',
    ]);
  });
});

describe('validateHardware on a Seeed XIAO', () => {
  const xiao = (): KeyboardHardware => ({ ...wired(), controller: 'seeeduino_xiao_ble' });

  it('accepts XIAO pins and flags pins it doesn’t have, keeping them', () => {
    expect(validateHardware(xiao())).toEqual([]);
    const hw = xiao();
    const kept = { ...hw, wiring: { kind: 'matrix' as const, diodeDirection: 'col2row' as const, rows: [4, 5], cols: [6, 7, 14] } };
    expect(messages(kept)).toEqual(['Column 2 on the left half uses D14, which isn’t a Seeed XIAO pin.']);
    // Switching back to a Pro Micro makes the kept pin valid again.
    expect(messages({ ...kept, controller: 'nice_nano_v2' })).toEqual([]);
  });

  it('checks the whole wiring fits in 11 pins', () => {
    const hw = xiao();
    const tooMany = { ...hw, wiring: { kind: 'direct' as const, pins: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null] } };
    expect(messages(tooMany)[0]).toBe('The wiring on the left half needs 12 pins, but a Seeed XIAO has 11.');
  });

  it('puts OLEDs on D4/D5 and a nice!view on D9/D10/D8', () => {
    const hw = xiao(); // rows [4, 5], cols [6, 7, 8]
    expect(messages(setDisplay(hw, 'left', 'oled_128x32'))).toEqual([
      'D4 is used for both Row 0 and Display SDA on the left half.',
      'D5 is used for both Row 1 and Display SCL on the left half.',
    ]);
    const free = { ...hw, wiring: { kind: 'matrix' as const, diodeDirection: 'col2row' as const, rows: [0, 1], cols: [2, 3, 6] } };
    expect(messages(setDisplay(free, 'left', 'oled_128x32'))).toEqual([]);
    expect(messages(setDisplay(free, 'right', 'nice_view'))).toEqual([]);
    expect(messages(setDisplay(hw, 'left', 'nice_view'))).toEqual(['D8 is used for both Column 2 and Display clock on the left half.']);
  });
});

describe('validateHardware with display pins', () => {
  it('needs a pin for every display signal', () => {
    const view = setDisplay(wired(), 'left', 'nice_view');
    expect(messages(setDisplayPin(view, 'left', 'cs', null))).toEqual(['Display CS on the left half has no pin.']);
  });

  it('checks moved display pins against the rest of their half, mirrored or not', () => {
    const view = setDisplay(wired(), 'left', 'nice_view'); // rows [4, 5], cols [6, 7, 8]
    expect(messages(setDisplayPin(view, 'left', 'cs', 4))).toEqual(['D4 is used for both Row 0 and Display CS on the left half.']);
    // The right half mirrors the left's pins; its own display is checked against them.
    const oled = setDisplayPin(setDisplay(wired(), 'right', 'oled_128x32'), 'right', 'sda', 4);
    expect(messages(oled)).toEqual(['D4 is used for both Row 0 and Display SDA on the right half.']);
  });

  it('warns that a Mikoto display on D6 assumes the board’s default revision', () => {
    const hw = { ...wired(), controller: 'mikoto', wiring: { kind: 'matrix' as const, diodeDirection: 'col2row' as const, rows: [4, 5], cols: [7, 8, 9] } };
    const view = setDisplayPin(setDisplay(hw, 'left', 'nice_view'), 'left', 'clock', 6);
    expect(messages(view)).toEqual([]);
    expect(messages(view, 'warning')).toContain(
      'Display clock on the left half uses D6, which is a different pin on Mikoto v6 and later; the build assumes Mikoto 5.20.',
    );
  });

  it('still rejects controllers it doesn’t know', () => {
    expect(messages({ ...wired(), controller: 'nope' })).toEqual(['nope isn’t a supported controller.']);
  });
});

describe('shift register checks', () => {
  const errors = (hw: KeyboardHardware) => validateHardware(hw).filter((i) => i.level === 'error').map((i) => i.message);

  it('accepts a correct keyboard', () => {
    expect(errors(testShiftPad)).toEqual([]);
  });

  it('flags an output on an input line, e.g. after switching the diode direction', () => {
    const hw: KeyboardHardware = { ...testShiftPad, wiring: { kind: 'matrix', diodeDirection: 'row2col', rows: [4, 5], cols: (testShiftPad.wiring as MatrixWiring).cols } };
    expect(errors(hw)).toContain('Column 0 uses a shift register output, but shift registers can only drive rows on this matrix (row2col). Use a pin, or switch the diode direction.');
  });

  it('flags an output beyond the chain, and outputs without shift registers', () => {
    expect(errors(setPin(testShiftPad, undefined, 'cols', 3, { sr: 20 }))).toContain('Column 3 uses output 20, but 1 shift register has 8 outputs (0–7).');
    const none: KeyboardHardware = { ...testShiftPad };
    delete none.shiftRegisters;
    expect(errors(none)).toContain('Column 0 uses output 0, but there are no shift registers.');
  });

  it('flags an output used twice', () => {
    expect(errors(setPin(testShiftPad, undefined, 'cols', 5, { sr: 4 }))).toContain('Output 4 is used for both Column 4 and Column 5.');
  });

  it('checks the latch, data and clock pins like other pins', () => {
    expect(errors({ ...testShiftPad, shiftRegisters: { count: 1, latch: null } })).toContain('Shift register latch has no pin.');
    expect(errors({ ...testShiftPad, shiftRegisters: { count: 1, latch: 4 } })).toContain('D4 is used for both Row 0 and Shift register latch.');
  });

  it('doesn’t report the pins shared with a nice!view, but does report a clash on an own bus', () => {
    // The nice!view's CS is D1, data D2, clock D3; the latch is D8.
    expect(errors(setDisplay(testShiftPad, undefined, 'nice_view'))).toEqual([]);
    expect(errors(setShiftOwnBus(setDisplay(testShiftPad, undefined, 'nice_view'), true))).toContain('D2 is used for both Display data and Shift register data.');
  });

  it('flags a bad count, a split and direct wiring', () => {
    expect(errors({ ...testShiftPad, shiftRegisters: { count: 5, latch: 8 } })).toContain('Use 1 to 4 shift registers.');
    const split = { ...gridHardware({ ...DEFAULT_BASICS, rows: 1, cols: 2 }), shiftRegisters: { count: 1, latch: 8 } };
    expect(errors(split)).toContain('Shift registers only work on one-piece keyboards with a matrix.');
  });
});

describe('basics pin count with shift registers', () => {
  it('counts the bus pins and the lines left on pins', () => {
    const b = { ...DEFAULT_BASICS, split: false, rows: 6, cols: 18 };
    expect(validateBasics(b).map((i) => i.message)).toContain('A 6 × 18 matrix needs 24 pins, but a Pro Micro has 18.');
    expect(validateBasics({ ...b, shiftRegisters: 2 })).toEqual([]);
    expect(validateBasics({ ...b, rows: 16, cols: 18, shiftRegisters: 1 }).map((i) => i.message)).toContain(
      'A 16 × 18 matrix with 1 shift register needs 29 pins, but a Pro Micro has 18.',
    );
  });
});
