import type { DiodeDirection, HardwareKey, KeyboardHardware, Pin, Side, Wiring } from './types.ts';
import { halfSize } from './wiring.ts';

/** The first wizard step's choices. `rows` × `cols` is per half on a split. */
export interface HardwareBasics {
  displayName: string;
  name: string;
  controller: string;
  split: boolean;
  rows: number;
  cols: number;
  wiring: 'matrix' | 'direct';
  diodeDirection: DiodeDirection;
}

export const DEFAULT_BASICS: HardwareBasics = {
  displayName: 'My Keyboard',
  name: 'my_keyboard',
  controller: 'nice_nano_v2',
  split: true,
  rows: 3,
  cols: 6,
  wiring: 'matrix',
  diodeDirection: 'col2row',
};

/** A shield id from a display name: "My Split 2!" → "my_split_2". */
export function hardwareName(displayName: string): string {
  const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!slug) return 'my_keyboard';
  return /^[a-z]/.test(slug) ? slug : `kb_${slug}`;
}

/** Key units between the halves. */
const GAP = 4;

/** A rows × columns keyboard (per half), each key on its own matrix position or input, no pins picked yet. */
export function gridHardware(b: HardwareBasics): KeyboardHardware {
  const direct = b.wiring === 'direct';
  const keys: HardwareKey[] = [];
  const add = (x: number, y: number, row: number, col: number, side?: Side) =>
    keys.push({ x: x * 100, y: y * 100, w: 100, h: 100, r: 0, rx: 0, ry: 0, row, col, ...(side ? { side } : {}) });
  for (let r = 0; r < b.rows; r++) {
    for (let c = 0; c < b.cols; c++) {
      if (direct) add(c, r, 0, r * b.cols + c, b.split ? 'left' : undefined);
      else add(c, r, r, c, b.split ? 'left' : undefined);
    }
    if (!b.split) continue;
    for (let c = 0; c < b.cols; c++) {
      // Mirrored: the right half's key at column c matches the left's key at column cols-1-c.
      if (direct) add(b.cols + GAP + c, r, 0, r * b.cols + (b.cols - 1 - c), 'right');
      else add(b.cols + GAP + c, r, r, c, 'right');
    }
  }
  const empty = (n: number): Pin[] => Array.from({ length: n }, () => null);
  const wiring: Wiring = direct
    ? { kind: 'direct', pins: empty(b.rows * b.cols) }
    : { kind: 'matrix', diodeDirection: b.diodeDirection, rows: empty(b.rows), cols: empty(b.cols) };
  return { name: b.name, displayName: b.displayName, controller: b.controller, split: b.split, wiring, keys };
}

/**
 * The basics of an existing keyboard, for editing it. Direct wiring reports
 * one row of inputs (the left half's, or the only half's) — never guessed
 * from the keys' positions, which a staggered key would throw off.
 */
export function basicsOf(hw: KeyboardHardware): HardwareBasics {
  const size = halfSize(hw, hw.split ? 'left' : undefined);
  return {
    displayName: hw.displayName,
    name: hw.name,
    controller: hw.controller,
    split: hw.split,
    rows: hw.wiring.kind === 'direct' ? 1 : size.rows,
    cols: size.cols,
    wiring: hw.wiring.kind,
    diodeDirection: hw.wiring.kind === 'matrix' ? hw.wiring.diodeDirection : 'col2row',
  };
}
