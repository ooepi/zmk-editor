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
