import { describe, expect, it } from 'vitest';
import { DEFAULT_BASICS, gridHardware } from './grid.ts';
import type { KeyboardHardware } from './types.ts';
import { setDisplay } from './displays.ts';
import { hasErrors, validateBasics, validateHardware } from './validate.ts';

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
      'A 6 × 14 matrix needs 20 pins per half, but the controller has 18.',
    ]);
    expect(validateBasics({ ...basics, wiring: 'direct', split: false, rows: 4, cols: 5 }).map((i) => i.message)).toEqual([
      'Direct wiring for 20 keys needs 20 pins, but the controller has 18.',
    ]);
    expect(validateBasics({ ...basics, rows: 0 }).map((i) => i.message)).toEqual(['Use at least 1 row.']);
  });
});
