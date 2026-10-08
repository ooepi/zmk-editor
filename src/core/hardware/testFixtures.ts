import { DEFAULT_BASICS, gridHardware } from './grid.ts';
import type { KeyboardHardware } from './types.ts';

/** A 1×2-per-half split, COL2ROW, right half mirrored. Shared by core and UI tests. */
export const testSplit: KeyboardHardware = {
  ...gridHardware({ ...DEFAULT_BASICS, name: 'test_split', displayName: 'Test Split', rows: 1, cols: 2 }),
  wiring: { kind: 'matrix', diodeDirection: 'col2row', rows: [4], cols: [6, 7] },
};

/** A two-key direct-wired pad in one piece. */
export const testPad: KeyboardHardware = {
  ...gridHardware({ ...DEFAULT_BASICS, name: 'test_pad', displayName: 'Test Pad', split: false, wiring: 'direct', rows: 1, cols: 2 }),
  wiring: { kind: 'direct', pins: [4, 5] },
};

/** A 2×10 one-piece matrix: columns 0–7 on one 74HC595 (latch D8, data/clock on D2/D3), columns 8–9 on D6/D7. */
export const testShiftPad: KeyboardHardware = {
  ...gridHardware({ ...DEFAULT_BASICS, name: 'test_shift', displayName: 'Test Shift', split: false, rows: 2, cols: 10 }),
  wiring: { kind: 'matrix', diodeDirection: 'col2row', rows: [4, 5], cols: [...Array.from({ length: 8 }, (_, i) => ({ sr: i })), 6, 7] },
  shiftRegisters: { count: 1, latch: 8 },
};
