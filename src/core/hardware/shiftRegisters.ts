import { halfDisplay, halfDisplayPins } from './displays.ts';
import { interconnectOf } from './interconnects.ts';
import type { KeyboardHardware, LinePin, MatrixWiring, Pin, ShiftOutput } from './types.ts';

export const MAX_SHIFT_REGISTERS = 4;
export const OUTPUTS_PER_REGISTER = 8;

export type ShiftSignal = 'latch' | 'data' | 'clock';

/** What each shift register pin is used for, as shown in pin uses. */
export const SHIFT_USES: Record<ShiftSignal, string> = {
  latch: 'Shift register latch',
  data: 'Shift register data',
  clock: 'Shift register clock',
};

export const isShiftOutput = (p: LinePin): p is ShiftOutput => typeof p === 'object' && p !== null;

/** A line's controller pin; null for no pin or a shift register output. */
export const controllerPin = (p: LinePin): Pin => (isShiftOutput(p) ? null : p);

export const outputCount = (hw: KeyboardHardware): number => (hw.shiftRegisters?.count ?? 0) * OUTPUTS_PER_REGISTER;

/** The lines shift registers can drive: columns on COL2ROW, rows on ROW2COL; none without a matrix. */
export function drivenList(hw: KeyboardHardware): 'rows' | 'cols' | undefined {
  if (hw.wiring.kind !== 'matrix') return undefined;
  return hw.wiring.diodeDirection === 'col2row' ? 'cols' : 'rows';
}

/** "Output 9 (U2 QB)": U1 is the register wired to the controller. */
export function outputLabel(n: number): string {
  return `Output ${n} (U${Math.floor(n / OUTPUTS_PER_REGISTER) + 1} Q${String.fromCharCode(65 + (n % OUTPUTS_PER_REGISTER))})`;
}

/** Whether the shift registers share the nice!view's SPI bus (data and clock are the display's). */
export function sharesNiceViewBus(hw: KeyboardHardware): boolean {
  return hw.shiftRegisters !== undefined && !hw.shiftRegisters.ownBus && halfDisplay(hw, undefined) === 'nice_view';
}

/** The shift registers' effective pins; undefined without shift registers. */
export function shiftPins(hw: KeyboardHardware): { latch: Pin; data: Pin; clock: Pin; shared: boolean } | undefined {
  const sr = hw.shiftRegisters;
  if (!sr) return undefined;
  if (sharesNiceViewBus(hw)) {
    const pins = halfDisplayPins(hw, undefined);
    const get = (signal: 'data' | 'clock') => pins.find((p) => p.signal === signal)?.pin ?? null;
    return { latch: sr.latch, data: get('data'), clock: get('clock'), shared: true };
  }
  const ic = interconnectOf(hw.controller);
  return {
    latch: sr.latch,
    data: sr.data !== undefined ? sr.data : ic.niceViewPins.data,
    clock: sr.clock !== undefined ? sr.clock : ic.niceViewPins.clock,
    shared: false,
  };
}

const lineName = (list: 'rows' | 'cols', i: number) => `${list === 'rows' ? 'Row' : 'Column'} ${i}`;

/** Which lines use each output, e.g. 3 → ["Column 3"]. */
export function outputUses(hw: KeyboardHardware): Map<number, string[]> {
  const uses = new Map<number, string[]>();
  if (hw.wiring.kind !== 'matrix') return uses;
  for (const list of ['rows', 'cols'] as const) {
    hw.wiring[list].forEach((p, i) => {
      if (isShiftOutput(p)) uses.set(p.sr, [...(uses.get(p.sr) ?? []), lineName(list, i)]);
    });
  }
  return uses;
}

/**
 * Turns shift registers on (filling the driven lines with outputs 0, 1, 2…),
 * changes their number (more: lines without a pin get the new outputs; fewer:
 * lines on outputs that no longer exist get no pin) or, with 0, turns them off
 * (every output becomes no pin). Split and direct-wired keyboards are left alone.
 */
export function setShiftRegisterCount(hw: KeyboardHardware, count: number): KeyboardHardware {
  const list = drivenList(hw);
  if (!list || hw.split || hw.wiring.kind !== 'matrix') return hw;
  const wiring: MatrixWiring = hw.wiring;
  const outputs = Math.max(0, count) * OUTPUTS_PER_REGISTER;
  const before = outputCount(hw);
  const clear = (lines: LinePin[]) => lines.map((p) => (isShiftOutput(p) && p.sr >= outputs ? null : p));
  const fill = (lines: LinePin[]) =>
    lines.map((p, i): LinePin => {
      if (i >= outputs) return p;
      if (before === 0) return { sr: i };
      return i >= before && p === null ? { sr: i } : p;
    });
  const rows = list === 'rows' ? fill(clear(wiring.rows)) : clear(wiring.rows);
  const cols = list === 'cols' ? fill(clear(wiring.cols)) : clear(wiring.cols);
  const next: KeyboardHardware = { ...hw, wiring: { ...wiring, rows, cols } };
  if (count <= 0) {
    delete next.shiftRegisters;
    return next;
  }
  next.shiftRegisters = { ...(hw.shiftRegisters ?? { latch: null }), count };
  return next;
}

/** Sets the latch, data or clock pin; a default data or clock pin removes the override. Ignored while the bus is shared. */
export function setShiftPin(hw: KeyboardHardware, signal: ShiftSignal, pin: Pin): KeyboardHardware {
  const sr = hw.shiftRegisters;
  if (!sr) return hw;
  if (signal === 'latch') return { ...hw, shiftRegisters: { ...sr, latch: pin } };
  if (sharesNiceViewBus(hw)) return hw;
  const fallback = interconnectOf(hw.controller).niceViewPins[signal];
  const next = { ...sr, [signal]: pin };
  if (pin === fallback) {
    if (signal === 'data') delete next.data;
    else delete next.clock;
  }
  return { ...hw, shiftRegisters: next };
}

/** With a nice!view: puts the shift registers on their own data and clock pins (true) or back on its bus (false). */
export function setShiftOwnBus(hw: KeyboardHardware, on: boolean): KeyboardHardware {
  const sr = hw.shiftRegisters;
  if (!sr) return hw;
  const next = { ...sr };
  if (on) next.ownBus = true;
  else delete next.ownBus;
  return { ...hw, shiftRegisters: next };
}

/** "0–15" or "0–7, 9" from sorted indexes. */
function ranges(xs: number[]): string {
  const parts: string[] = [];
  let start = xs[0] ?? 0;
  let prev = start;
  for (const x of [...xs.slice(1), Number.NaN]) {
    if (x === prev + 1) {
      prev = x;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = x;
    prev = x;
  }
  return parts.join(', ');
}

/** "Columns 0–15 on 2 shift registers (74HC595)"; undefined when no line uses an output. */
export function shiftSummary(hw: KeyboardHardware): string | undefined {
  const list = drivenList(hw);
  if (!hw.shiftRegisters || !list || hw.wiring.kind !== 'matrix') return undefined;
  const used = hw.wiring[list].flatMap((p, i) => (isShiftOutput(p) ? [i] : []));
  if (used.length === 0) return undefined;
  const noun = list === 'cols' ? 'Column' : 'Row';
  const n = hw.shiftRegisters.count;
  return `${noun}${used.length > 1 ? 's' : ''} ${ranges(used)} on ${n} shift register${n > 1 ? 's' : ''} (74HC595)`;
}
