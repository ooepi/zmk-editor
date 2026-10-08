# Shift registers (74HC595) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-piece matrix keyboards designed in the wizard can drive columns (rows on ROW2COL) from 1–4 chained 74HC595 shift registers, and the editor generates a working ZMK shield for them.

**Architecture:** A matrix line becomes a `LinePin`: a controller pin, `null`, or a shift register output `{ sr: n }`. A new `shiftRegisters` block on `KeyboardHardware` holds the count, latch, optional data/clock overrides and `ownBus`. A new `shiftRegisters.ts` holds the helpers. Generation writes either a separate SPI2 bus or a second device on the nice!view's bus. Validation, file format (version 3), wizard UI, help and CI fixtures follow.

**Tech Stack:** TypeScript, React 19, Vite, vitest + testing-library (jsdom), ZMK v0.3 devicetree.

**Spec:** `docs/specs/2026-10-08-shift-registers-design.md`

## Global Constraints

- One-piece matrix keyboards only; split or direct-wired keyboards never get shift registers.
- Only the 74HC595; `count` is 1–4; 8 outputs per register; outputs are numbered from the register wired to the controller (U1): output N is U(N/8 + 1) pin Q(A + N mod 8).
- Outputs only go on driven lines: columns for `col2row`, rows for `row2col`.
- Data/clock default to the interconnect's nice!view pins (`ic.niceViewPins.data` / `.clock`: Pro Micro D2/D3, XIAO D10/D8); stored only when moved.
- The bus is shared exactly when the keyboard has a nice!view and `ownBus` isn't set.
- Own bus: `&spi2`, `spi-max-frequency = <1000000>`, latch `GPIO_ACTIVE_LOW`. Shared bus: nice!view CS first (`GPIO_ACTIVE_HIGH`), latch second (`GPIO_ACTIVE_LOW`), `shifter: 595@1` with `reg = <1>`.
- Definition files become version 3 only when `shiftRegisters` is present or a line holds an output; every other keyboard serializes byte-identically to today.
- Keyboards without shift registers generate byte-identical shield files.
- User-facing copy: plain words, sentence case, curly apostrophes (’) like the existing messages.
- Run `npm run typecheck`, `npm run lint` and `npx vitest run` green before each commit.

## Review Focus

1. **Older keyboards unchanged:** a keyboard without shift registers opened and saved writes the same definition and shield files as before. Pinned by the "unchanged" tests in Tasks 2 and 4 plus the existing golden snapshots.
2. **Changing the count back and forth:** 2 → 1 → 2 must not lose hand-picked pins on other columns or leave outputs beyond the chain. Pinned in Task 1 (`setShiftRegisterCount` sequence test).
3. **Returning to Basics after changing the count on the Wiring step:** Basics must show the current count, and Next must not reapply a stale one. Pinned in Task 5 (wizard test).
4. **Shared data/clock pins on the pinout:** "Display data, Shift register data" on one pad must not be coloured as a clash. Pinned in Task 6 (`padClass` test).
5. **An output selected on an input line after switching diode direction:** validation must flag it rather than generate a broken shield. Pinned in Task 3.

---

### Task 1: Model and helpers

**Files:**
- Modify: `src/core/hardware/types.ts`
- Create: `src/core/hardware/shiftRegisters.ts`
- Modify: `src/core/hardware/wiring.ts` (`PinList`, `setPin`, `pinUses`)
- Modify: `src/core/hardware/displays.ts` (`usesNiceViewAdapter`)
- Modify: `src/core/hardware/testFixtures.ts`
- Modify: `src/ui/components/HardwareWizard.tsx` (`anyPin` only, to keep the type check green)
- Test: `src/core/hardware/shiftRegisters.test.ts`

**Interfaces:**
- Produces (used by every later task):
  - `type ShiftOutput = { sr: number }`, `type LinePin = Pin | ShiftOutput`, `interface ShiftRegisters { count: number; latch: Pin; data?: Pin; clock?: Pin; ownBus?: boolean }`, `KeyboardHardware.shiftRegisters?: ShiftRegisters`, `MatrixWiring.rows/cols: LinePin[]`.
  - From `shiftRegisters.ts`: `MAX_SHIFT_REGISTERS = 4`, `OUTPUTS_PER_REGISTER = 8`, `isShiftOutput(p: LinePin): p is ShiftOutput`, `controllerPin(p: LinePin): Pin`, `outputCount(hw): number`, `drivenList(hw): 'rows' | 'cols' | undefined`, `outputLabel(n: number): string`, `type ShiftSignal = 'latch' | 'data' | 'clock'`, `SHIFT_USES: Record<ShiftSignal, string>`, `sharesNiceViewBus(hw): boolean`, `shiftPins(hw): { latch: Pin; data: Pin; clock: Pin; shared: boolean } | undefined`, `outputUses(hw): Map<number, string[]>`, `setShiftRegisterCount(hw, count: number): KeyboardHardware`, `setShiftPin(hw, signal: ShiftSignal, pin: Pin): KeyboardHardware`, `setShiftOwnBus(hw, on: boolean): KeyboardHardware`, `shiftSummary(hw): string | undefined`.
  - `PinList` gains `` `shift.${ShiftSignal}` ``; `setPin(hw, side, list, index, pin: LinePin)`.
  - `testShiftPad` fixture.

- [ ] **Step 1: Write the failing tests**

Create `src/core/hardware/shiftRegisters.test.ts`:

```ts
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
```

Add to `src/core/hardware/testFixtures.ts`:

```ts
/** A 2×10 one-piece matrix: columns 0–7 on one 74HC595 (latch D8, data/clock on D2/D3), columns 8–9 on D6/D7. */
export const testShiftPad: KeyboardHardware = {
  ...gridHardware({ ...DEFAULT_BASICS, name: 'test_shift', displayName: 'Test Shift', split: false, rows: 2, cols: 10 }),
  wiring: { kind: 'matrix', diodeDirection: 'col2row', rows: [4, 5], cols: [...Array.from({ length: 8 }, (_, i) => ({ sr: i })), 6, 7] },
  shiftRegisters: { count: 1, latch: 8 },
};
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/core/hardware/shiftRegisters.test.ts`
Expected: FAIL (cannot resolve `./shiftRegisters.ts`).

- [ ] **Step 3: Implement**

`src/core/hardware/types.ts`, replace `MatrixPins` and `MatrixWiring` and add the new types:

```ts
/** A shift register output: output N is pin Q(A + N mod 8) of register N / 8 (the first is the one wired to the controller). */
export interface ShiftOutput {
  sr: number;
}

/** A matrix line's wire: a controller pin, no pin yet, or a shift register output. */
export type LinePin = Pin | ShiftOutput;

export interface MatrixPins {
  rows: LinePin[];
  cols: LinePin[];
}

export interface MatrixWiring {
  kind: 'matrix';
  diodeDirection: DiodeDirection;
  rows: LinePin[];
  cols: LinePin[];
  /** The right half's own pins; without it the right half mirrors the left. */
  right?: MatrixPins;
}

/** 74HC595s chained on an SPI bus, driving matrix lines; one-piece keyboards only. */
export interface ShiftRegisters {
  /** 1 to 4; 8 outputs each. */
  count: number;
  /** RCLK, the SPI chip select. */
  latch: Pin;
  /** SER (MOSI) moved off its default; ignored while the bus is shared with a nice!view. */
  data?: Pin;
  /** SRCLK (SCK) moved off its default; ignored while the bus is shared with a nice!view. */
  clock?: Pin;
  /** With a nice!view: true puts the shift registers on their own data and clock pins instead of sharing its bus. */
  ownBus?: boolean;
}
```

and in `KeyboardHardware`, after `encoderSpots`:

```ts
  /** 74HC595 shift registers driving matrix lines; one-piece matrix keyboards only. */
  shiftRegisters?: ShiftRegisters;
```

Create `src/core/hardware/shiftRegisters.ts`:

```ts
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
  const next = { ...sr };
  if (pin === fallback) delete next[signal];
  else next[signal] = pin;
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
```

`src/core/hardware/displays.ts`, in `usesNiceViewAdapter`, add as the first line of the body (import `sharesNiceViewBus` from `./shiftRegisters.ts`):

```ts
  // A bus shared with shift registers needs two chip selects, which the adapter's bus can't carry.
  if (sharesNiceViewBus(hw)) return false;
```

`src/core/hardware/wiring.ts`:
- imports: add `import { controllerPin, SHIFT_USES, setShiftPin, shiftPins, type ShiftSignal } from './shiftRegisters.ts';` and `LinePin` to the type import.
- `PinList`: `export type PinList = 'rows' | 'cols' | 'pins' | 'encoderA' | 'encoderB' | `display.${DisplaySignal}` | `shift.${ShiftSignal}`;`
- `setPin`: change the `pin` parameter type to `LinePin`, and handle the new lists first:

```ts
export function setPin(hw: KeyboardHardware, side: Side | undefined, list: PinList, index: number, pin: LinePin): KeyboardHardware {
  const plain = controllerPin(pin);
  if (list === 'encoderA' || list === 'encoderB') return setEncoderPin(hw, side, index, list === 'encoderA' ? 'a' : 'b', plain);
  if (list.startsWith('display.')) return setDisplayPin(hw, side, list.slice('display.'.length) as DisplaySignal, plain);
  if (list.startsWith('shift.')) return setShiftPin(hw, list.slice('shift.'.length) as ShiftSignal, plain);
  const wiring = hw.wiring;
  if (wiring.kind === 'direct') {
    const put = (pins: Pin[]) => pins.map((p, i) => (i === index ? plain : p));
    if (side === 'right') return { ...hw, wiring: { ...wiring, right: put(directPins(wiring, 'right')) } };
    return { ...hw, wiring: { ...wiring, pins: put(wiring.pins) } };
  }
  const put = (pins: LinePin[]) => pins.map((p, i) => (i === index ? pin : p));
  const which = list === 'rows' ? 'rows' : 'cols';
  if (side === 'right') {
    const right = matrixPins(wiring, 'right');
    return { ...hw, wiring: { ...wiring, right: { ...right, [which]: put(right[which]) } } };
  }
  return { ...hw, wiring: { ...wiring, [which]: put(wiring[which]) } };
}
```

- `resizeMatrix`: change `fit` to `const fit = (pins: LinePin[], n: number): LinePin[] => …`.
- `pinUses`: map matrix lines through `controllerPin`, and add the shift register pins (one-piece only):

```ts
    pins.rows.forEach((pin, i) => add(controllerPin(pin), `Row ${i}`));
    pins.cols.forEach((pin, i) => add(controllerPin(pin), `Column ${i}`));
```

and after the display line:

```ts
  const shift = side === undefined ? shiftPins(hw) : undefined;
  if (shift) {
    add(shift.latch, SHIFT_USES.latch);
    add(shift.data, SHIFT_USES.data);
    add(shift.clock, SHIFT_USES.clock);
  }
```

`src/ui/components/HardwareWizard.tsx`, `anyPin`: outputs aren't picked pins (they're filled in automatically):

```ts
  return pins.some((p) => p !== null && !isShiftOutput(p));
```

(import `isShiftOutput` from `../../core/hardware/shiftRegisters.ts`).

Run `npm run typecheck`. Any remaining type errors are matrix-line reads in `generate.ts` (`gpioList`) and `validate.ts` (labelled pins); fix them minimally here so the check is green:
- `generate.ts` `gpioList`: change `pins: Pin[]` to `pins: LinePin[]` and render outputs (Task 4 relies on this):

```ts
function gpioList(gpio: string, property: string, pins: LinePin[], flags: string, indent: string): string {
  const ref = (pin: LinePin) => (isShiftOutput(pin) ? `&shifter ${String(pin.sr).padStart(2)}` : `&${gpio} ${String(pin ?? '?').padStart(2)}`);
  const entries = pins.map((pin, i) => `${indent}    ${i === 0 ? '=' : ','} <${ref(pin)} ${flags}>`);
  return [`${indent}${property}`, ...entries, `${indent}    ;`].join('\n');
}
```

- `validate.ts` labelled list: skip outputs for now (Task 3 adds the shift register checks):

```ts
              ...matrixPins(hw.wiring, side).rows.flatMap((pin, i) => (isShiftOutput(pin) ? [] : [{ label: `Row ${i}`, pin }])),
              ...matrixPins(hw.wiring, side).cols.flatMap((pin, i) => (isShiftOutput(pin) ? [] : [{ label: `Column ${i}`, pin }])),
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/core/hardware/shiftRegisters.test.ts` → PASS.
Run: `npm run typecheck && npm run lint && npx vitest run` → all green (existing snapshots unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/core/hardware src/ui/components/HardwareWizard.tsx
git commit -m "Shift registers: model and helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Definition file (version 3)

**Files:**
- Modify: `src/core/hardware/definition.ts`
- Test: `src/core/hardware/definition.test.ts`

**Interfaces:**
- Consumes: `LinePin`, `ShiftRegisters`, `isShiftOutput`, `testShiftPad` (Task 1).
- Produces: `serializeHardware` / `parseHardware` that round-trip `shiftRegisters` and `{ sr }` lines.

- [ ] **Step 1: Write the failing tests**

In `definition.test.ts`, change the unsupported-version assertion to version 4:

```ts
    expect(() => parseHardware('{"version": 4}')).toThrow('version 4 isn’t supported; update the editor');
```

and add (import `testShiftPad` from `./testFixtures.ts`, `setDisplay` from `./displays.ts`, `setShiftOwnBus`, `setShiftPin` from `./shiftRegisters.ts`):

```ts
describe('hardware definition with shift registers', () => {
  it('round-trips as version 3, with outputs written compactly', () => {
    const text = serializeHardware(testShiftPad);
    expect(text.startsWith('{\n  "version": 3,')).toBe(true);
    expect(text).toContain('      { "sr": 0 },\n');
    expect(text).toContain('"shiftRegisters": {\n    "count": 1,\n    "latch": 8\n  }');
    expect(parseHardware(text)).toEqual(testShiftPad);
    expect(serializeHardware(parseHardware(text))).toBe(text);
  });

  it('writes moved data and clock pins and ownBus, in that order', () => {
    const hw = setShiftPin(setShiftPin(setShiftOwnBus(setDisplay(testShiftPad, undefined, 'nice_view'), true), 'clock', 20), 'data', 19);
    const text = serializeHardware(hw);
    expect(text).toContain('"shiftRegisters": {\n    "count": 1,\n    "latch": 8,\n    "data": 19,\n    "clock": 20,\n    "ownBus": true\n  }');
    expect(parseHardware(text)).toEqual(hw);
  });

  it('leaves keyboards without shift registers unchanged', () => {
    expect(serializeHardware(hw)).toBe(serializeHardware(parseHardware(serializeHardware(hw))));
    expect(serializeHardware(hw)).not.toContain('shiftRegisters');
    expect(serializeHardware(hw).startsWith('{\n  "version": 1,')).toBe(true);
  });

  it('explains a bad output or a bad block', () => {
    const text = serializeHardware(testShiftPad);
    expect(() => parseHardware(text.replace('{ "sr": 0 }', '{ "sr": -1 }'))).toThrow('wiring.cols must be a list of pins or shift register outputs');
    expect(() => parseHardware(text.replace('"count": 1', '"count": "one"'))).toThrow('shiftRegisters.count must be a number');
    expect(() => parseHardware(text.replace(/"shiftRegisters": \{[^}]*\}/, '"shiftRegisters": 5'))).toThrow('shiftRegisters must be an object');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/core/hardware/definition.test.ts`
Expected: FAIL (version 1 written, no `shiftRegisters` key).

- [ ] **Step 3: Implement**

In `definition.ts`:

```ts
/** Version 2 adds `displayPins`, version 3 shift registers; each file is written with the lowest version that fits. */
const VERSION = 3;

const hasShiftRegisters = (hw: KeyboardHardware) =>
  hw.shiftRegisters !== undefined || (hw.wiring.kind === 'matrix' && [...hw.wiring.rows, ...hw.wiring.cols].some(isShiftOutput));
```

In `serializeHardware`:
- `version: hasShiftRegisters(hw) ? 3 : hw.displayPins ? 2 : 1,`
- after the `displayPins` entry:

```ts
      ...(hw.shiftRegisters
        ? {
            shiftRegisters: {
              count: hw.shiftRegisters.count,
              latch: hw.shiftRegisters.latch,
              ...(hw.shiftRegisters.data !== undefined ? { data: hw.shiftRegisters.data } : {}),
              ...(hw.shiftRegisters.clock !== undefined ? { clock: hw.shiftRegisters.clock } : {}),
              ...(hw.shiftRegisters.ownBus ? { ownBus: true } : {}),
            },
          }
        : {}),
```

- write outputs on one line: change the final `return` to

```ts
  const compact = head.replace(/\{\n\s+"sr": (\d+)\n\s+\}/g, '{ "sr": $1 }');
  return `${compact.replace('"keys": []', `"keys": ${list}`)}\n`;
```

In `parseHardware`:
- accept `data.version !== 1 && data.version !== 2 && data.version !== VERSION` → throw (keep the message).
- add next to `pins`:

```ts
  const linePins = (value: unknown, what: string): LinePin[] => {
    if (!Array.isArray(value)) throw new Error(`${what} must be a list of pins or shift register outputs`);
    return value.map((p: unknown): LinePin => {
      if (p === null) return null;
      if (typeof p === 'number' && Number.isFinite(p)) return p;
      if (isRecord(p) && typeof p.sr === 'number' && Number.isInteger(p.sr) && p.sr >= 0) return { sr: p.sr };
      throw new Error(`${what} must be a list of pins or shift register outputs`);
    });
  };
```

and use it for the matrix: `rows: linePins(w.rows, 'wiring.rows'), cols: linePins(w.cols, 'wiring.cols')` (the `right` lists too).
- after `displayPins` parsing:

```ts
  if (data.shiftRegisters !== undefined) {
    const sr = data.shiftRegisters;
    if (!isRecord(sr)) throw new Error('shiftRegisters must be an object');
    const optionalPin = (value: unknown, what: string): Pin => (value === null ? null : num(value, what));
    const shiftRegisters: ShiftRegisters = { count: num(sr.count, 'shiftRegisters.count'), latch: optionalPin(sr.latch, 'shiftRegisters.latch') };
    if (sr.data !== undefined) shiftRegisters.data = optionalPin(sr.data, 'shiftRegisters.data');
    if (sr.clock !== undefined) shiftRegisters.clock = optionalPin(sr.clock, 'shiftRegisters.clock');
    if (sr.ownBus === true) shiftRegisters.ownBus = true;
    hardware.shiftRegisters = shiftRegisters;
  }
```

(imports: `isShiftOutput` from `./shiftRegisters.ts`; `LinePin`, `ShiftRegisters` types.)

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run src/core/hardware/definition.test.ts` → PASS; then `npm run typecheck && npm run lint && npx vitest run` → green.

- [ ] **Step 5: Commit**

```bash
git add src/core/hardware/definition.ts src/core/hardware/definition.test.ts
git commit -m "Shift registers: definition file version 3

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Validation and basics

**Files:**
- Modify: `src/core/hardware/validate.ts`
- Modify: `src/core/hardware/grid.ts` (`HardwareBasics.shiftRegisters`, `DEFAULT_BASICS`, `basicsOf`)
- Test: `src/core/hardware/validate.test.ts`, `src/core/hardware/grid.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: `HardwareBasics.shiftRegisters: number` (0–4); new validation messages (exact text below).

- [ ] **Step 1: Write the failing tests**

Append to `validate.test.ts` (imports: `testShiftPad`; `setDisplay`; `setShiftOwnBus`; `setPin`; `DEFAULT_BASICS`, `gridHardware`; `validateBasics`):

```ts
describe('shift register checks', () => {
  const errors = (hw: KeyboardHardware) => validateHardware(hw).filter((i) => i.level === 'error').map((i) => i.message);

  it('accepts a correct keyboard', () => {
    expect(errors(testShiftPad)).toEqual([]);
  });

  it('flags an output on an input line, e.g. after switching the diode direction', () => {
    const hw: KeyboardHardware = { ...testShiftPad, wiring: { ...testShiftPad.wiring, kind: 'matrix', diodeDirection: 'row2col', rows: [4, 5], cols: (testShiftPad.wiring as MatrixWiring).cols } };
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
```

(Use the exact existing message text for the 24-pin case: check `pinCount` — for the Pro Micro the suffix is empty, so the message is `A 6 × 18 matrix needs 24 pins, but a Pro Micro has 18.`)

Append to `grid.test.ts`:

```ts
it('reports the shift register count of an existing keyboard', () => {
  expect(basicsOf(testShiftPad).shiftRegisters).toBe(1);
  expect(DEFAULT_BASICS.shiftRegisters).toBe(0);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/core/hardware/validate.test.ts src/core/hardware/grid.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`grid.ts`: add to `HardwareBasics`

```ts
  /** 74HC595s driving the matrix (0 for none); one-piece matrix keyboards only. */
  shiftRegisters: number;
```

`DEFAULT_BASICS`: `shiftRegisters: 0,`; `basicsOf`: `shiftRegisters: hw.shiftRegisters?.count ?? 0,`.

`validate.ts`, `validateBasics`: replace the matrix pin check with

```ts
  const shift = b.wiring === 'matrix' && !b.split ? b.shiftRegisters : 0;
  if (b.wiring === 'matrix') {
    const driven = b.diodeDirection === 'col2row' ? b.cols : b.rows;
    const inputs = b.diodeDirection === 'col2row' ? b.rows : b.cols;
    const needed = shift > 0 ? inputs + Math.max(0, driven - shift * OUTPUTS_PER_REGISTER) + 3 : b.rows + b.cols;
    const what = shift > 0 ? ` with ${shift} shift register${shift > 1 ? 's' : ''}` : '';
    if (needed > ic.pins.length) error(`A ${b.rows} × ${b.cols} matrix${what} needs ${needed} pins${perHalf}, ${pinCount(ic, true)}`);
  }
```

`validateHardware`:
- in the labelled list (inside the `side` loop), after the display pins:

```ts
        ...((): { label: string; pin: Pin }[] => {
          const shift = side === undefined ? shiftPins(hw) : undefined;
          if (!shift) return [];
          const own = shift.shared ? [] : [{ label: SHIFT_USES.data, pin: shift.data }, { label: SHIFT_USES.clock, pin: shift.clock }];
          return [{ label: SHIFT_USES.latch, pin: shift.latch }, ...own];
        })(),
```

- before `return issues;`:

```ts
  for (const message of shiftRegisterIssues(hw)) add('error', 'wiring', message);
```

- new function in `validate.ts`:

```ts
/** Shift register problems: where they can be used, the count, and each output line. */
function shiftRegisterIssues(hw: KeyboardHardware): string[] {
  const messages: string[] = [];
  const sr = hw.shiftRegisters;
  const lines = hw.wiring.kind === 'matrix' ? ([['rows', hw.wiring.rows], ['cols', hw.wiring.cols]] as const) : [];
  const anyOutput = lines.some(([, pins]) => pins.some(isShiftOutput));
  if (!sr && !anyOutput) return messages;
  if (hw.split || hw.wiring.kind !== 'matrix') return ['Shift registers only work on one-piece keyboards with a matrix.'];
  if (sr && (!Number.isInteger(sr.count) || sr.count < 1 || sr.count > MAX_SHIFT_REGISTERS)) messages.push('Use 1 to 4 shift registers.');
  const driven = drivenList(hw);
  const outputs = outputCount(hw);
  const seen = new Map<number, string>();
  for (const [list, pins] of lines) {
    pins.forEach((pin, i) => {
      if (!isShiftOutput(pin)) return;
      const name = `${list === 'rows' ? 'Row' : 'Column'} ${i}`;
      if (list !== driven) {
        const can = driven === 'cols' ? 'columns' : 'rows';
        messages.push(`${name} uses a shift register output, but shift registers can only drive ${can} on this matrix (${hw.wiring.kind === 'matrix' ? hw.wiring.diodeDirection : ''}). Use a pin, or switch the diode direction.`);
      } else if (!sr) {
        messages.push(`${name} uses output ${pin.sr}, but there are no shift registers.`);
      } else if (pin.sr >= outputs) {
        messages.push(`${name} uses output ${pin.sr}, but ${sr.count} shift register${sr.count > 1 ? 's have' : ' has'} ${outputs} outputs (0–${outputs - 1}).`);
      }
      const other = seen.get(pin.sr);
      if (other !== undefined) messages.push(`Output ${pin.sr} is used for both ${other} and ${name}.`);
      else seen.set(pin.sr, name);
    });
  }
  return messages;
}
```

(imports: `isShiftOutput`, `drivenList`, `outputCount`, `shiftPins`, `SHIFT_USES`, `MAX_SHIFT_REGISTERS`, `OUTPUTS_PER_REGISTER` from `./shiftRegisters.ts`.)

- [ ] **Step 4: Run to see them pass**

Run the two test files → PASS; then the full check (`npm run typecheck && npm run lint && npx vitest run`). `HardwareBasics` literals in UI tests that spread `DEFAULT_BASICS` keep compiling; any that build a full literal need `shiftRegisters: 0`.

- [ ] **Step 5: Commit**

```bash
git add src/core/hardware
git commit -m "Shift registers: validation and basics pin count

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Shield generation

**Files:**
- Modify: `src/core/hardware/generate.ts`
- Test: `src/core/hardware/generate.test.ts`, `src/core/hardware/golden.test.ts`

**Interfaces:**
- Consumes: `shiftPins`, `sharesNiceViewBus`, `outputCount`, `isShiftOutput` (Task 1); `gpioList` already renders `&shifter` (Task 1).
- Produces: the generated overlay sections described below.

- [ ] **Step 1: Write the failing tests**

Append to `generate.test.ts` (imports `testShiftPad`, `setShiftOwnBus`, `setShiftPin`, `hardwareBuildTargets` from `./config.ts`):

```ts
describe('generateShield: shift registers', () => {
  const overlay = (hw: KeyboardHardware) => generateShield(hw)[`${dir(hw.name)}/${hw.name}.overlay`] ?? '';

  it('drives columns from the shift register and keeps the direct columns', () => {
    const text = overlay(testShiftPad);
    expect(text).toContain('            = <&shifter  0 GPIO_ACTIVE_HIGH>\n');
    expect(text).toContain('            , <&shifter  7 GPIO_ACTIVE_HIGH>\n            , <&pro_micro  6 GPIO_ACTIVE_HIGH>\n');
  });

  it('puts them on their own SPI2 bus without a nice!view', () => {
    expect(overlay(testShiftPad)).toContain(`&pinctrl {
    shift_register_spi_default: shift_register_spi_default {
        group1 {
            psels = <NRF_PSEL(SPIM_SCK, 0, 20)>,
                <NRF_PSEL(SPIM_MOSI, 0, 17)>;
        };
    };
    shift_register_spi_sleep: shift_register_spi_sleep {
        group1 {
            psels = <NRF_PSEL(SPIM_SCK, 0, 20)>,
                <NRF_PSEL(SPIM_MOSI, 0, 17)>;
            low-power-enable;
        };
    };
};

&spi2 {
    status = "okay";
    compatible = "nordic,nrf-spim";
    pinctrl-0 = <&shift_register_spi_default>;
    pinctrl-1 = <&shift_register_spi_sleep>;
    pinctrl-names = "default", "sleep";
    cs-gpios = <&pro_micro 8 GPIO_ACTIVE_LOW>;

    shifter: 595@0 {
        compatible = "zmk,gpio-595";
        status = "okay";
        gpio-controller;
        spi-max-frequency = <1000000>;
        reg = <0>;
        #gpio-cells = <2>;
        ngpios = <8>;
    };
};`);
  });

  it('shares a nice!view’s bus: two chip selects, the shift registers as device 1, no adapter', () => {
    const hw = setDisplay(testShiftPad, undefined, 'nice_view');
    const text = overlay(hw);
    expect(text).toContain('nice_view_spi: &pro_micro_spi {');
    expect(text).toContain('    cs-gpios = <&pro_micro 1 GPIO_ACTIVE_HIGH>, <&pro_micro 8 GPIO_ACTIVE_LOW>;');
    expect(text).toContain('    shifter: 595@1 {');
    expect(text).toContain('        reg = <1>;');
    expect(text).not.toContain('&spi2');
    expect(hardwareBuildTargets(hw)[0]?.shield).toBe('test_shift nice_view');
  });

  it('keeps a nice!view on the adapter next to shift registers on their own bus', () => {
    const hw = setShiftPin(setShiftPin(setShiftOwnBus(setDisplay(testShiftPad, undefined, 'nice_view'), true), 'data', 19), 'clock', 20);
    const text = overlay(hw);
    expect(text).toContain('&spi2 {');
    expect(text).toContain('<NRF_PSEL(SPIM_SCK, 0, 29)>');
    expect(text).not.toContain('nice_view_spi');
    expect(hardwareBuildTargets(hw)[0]?.shield).toBe('test_shift nice_view_adapter nice_view');
  });

  it('sits next to an OLED, whose I2C bus stays enabled', () => {
    const text = overlay(setDisplay(testShiftPad, undefined, 'oled_128x32'));
    expect(text).toContain('&spi2 {');
    expect(text).toContain('&pro_micro_i2c {\n    status = "okay";');
  });

  it('turns on SPI in Kconfig.defconfig', () => {
    expect(generateShield(testShiftPad)[`${dir('test_shift')}/Kconfig.defconfig`]).toBe(`# Generated by ZMK Editor from test_shift.editor.json.

if SHIELD_TEST_SHIFT

config ZMK_KEYBOARD_NAME
    default "Test Shift"

config SPI
    default y

endif
`);
  });
});
```

Append to `golden.test.ts` (imports `isShiftOutput` not needed; add `hardwareBuildTargets` from `./config.ts`, `validateHardware` from `./validate.ts`):

```ts
/** The Subsata boards, proven on hardware with hand-written shields (ooepi/zmk-config-grstn-subsata). */
const outputs = Array.from({ length: 16 }, (_, i) => ({ sr: i }));
const subsata = (name: string, rows: number[], direct: number[]): KeyboardHardware => ({
  ...gridHardware({ ...DEFAULT_BASICS, name, displayName: 'Subsata', split: false, rows: 6, cols: 18 }),
  wiring: { kind: 'matrix', diodeDirection: 'col2row', rows, cols: [...outputs, ...direct] },
});
const subsataV1: KeyboardHardware = {
  ...subsata('subsata', [2, 3, 4, 5, 6, 7], [1, 0]),
  shiftRegisters: { count: 2, latch: 21, data: 19, clock: 20, ownBus: true },
  displays: { left: 'nice_view' },
  displayPins: { left: { cs: 10, data: 14, clock: 16 } },
};
const subsataV2: KeyboardHardware = {
  ...subsata('subsata_v2', [8, 9, 14, 15, 18, 19], [20, 21]),
  shiftRegisters: { count: 2, latch: 0 },
  displays: { left: 'nice_view' },
};

describe('Subsata shields (hand-written, proven on hardware)', () => {
  const overlay = (hw: KeyboardHardware) => generateShield(hw)[`config/boards/shields/${hw.name}/${hw.name}.overlay`] ?? '';

  it('v1: rows D2–D7, columns 0–15 on the 595s and 16–17 on D1/D0, two separate buses', () => {
    const text = overlay(subsataV1);
    expect(validateHardware(subsataV1).filter((i) => i.level === 'error')).toEqual([]);
    expect(text).toContain('= <&pro_micro  2 (GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)>');
    expect(text).toContain(', <&shifter 15 GPIO_ACTIVE_HIGH>\n            , <&pro_micro  1 GPIO_ACTIVE_HIGH>\n            , <&pro_micro  0 GPIO_ACTIVE_HIGH>');
    expect(text).toContain('<NRF_PSEL(SPIM_SCK, 0, 29)>,\n                <NRF_PSEL(SPIM_MOSI, 0, 2)>');
    expect(text).toContain('cs-gpios = <&pro_micro 21 GPIO_ACTIVE_LOW>;');
    expect(text).toContain('nice_view_spi: &pro_micro_spi {');
    expect(text).toContain('<NRF_PSEL(SPIM_SCK, 0, 10)>,\n                <NRF_PSEL(SPIM_MOSI, 1, 11)>');
    expect(text).toContain('cs-gpios = <&pro_micro 10 GPIO_ACTIVE_HIGH>;');
    expect(text).toContain('ngpios = <16>;');
  });

  it('v2: one bus shared with the nice!view (clock D3, data D2, CS D1, latch D0)', () => {
    const text = overlay(subsataV2);
    expect(validateHardware(subsataV2).filter((i) => i.level === 'error')).toEqual([]);
    expect(text).toContain('= <&pro_micro  8 (GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)>');
    expect(text).toContain(', <&shifter 15 GPIO_ACTIVE_HIGH>\n            , <&pro_micro 20 GPIO_ACTIVE_HIGH>\n            , <&pro_micro 21 GPIO_ACTIVE_HIGH>');
    expect(text).toContain('<NRF_PSEL(SPIM_SCK, 0, 20)>,\n                <NRF_PSEL(SPIM_MOSI, 0, 17)>');
    expect(text).toContain('cs-gpios = <&pro_micro 1 GPIO_ACTIVE_HIGH>, <&pro_micro 0 GPIO_ACTIVE_LOW>;');
    expect(text).toContain('ngpios = <16>;');
    expect(hardwareBuildTargets(subsataV2)[0]?.shield).toBe('subsata_v2 nice_view');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/core/hardware/generate.test.ts src/core/hardware/golden.test.ts` → FAIL (no bus, no SPI Kconfig).

- [ ] **Step 3: Implement**

In `generate.ts` (imports: `shiftPins`, `sharesNiceViewBus`, `outputCount` from `./shiftRegisters.ts`):

```ts
/** The 74HC595 chain as an SPI device (ZMK's `zmk,gpio-595`). */
function shifterNode(reg: number, outputs: number): string[] {
  return [
    `    shifter: 595@${reg} {`,
    '        compatible = "zmk,gpio-595";',
    '        status = "okay";',
    '        gpio-controller;',
    '        spi-max-frequency = <1000000>;',
    `        reg = <${reg}>;`,
    '        #gpio-cells = <2>;',
    `        ngpios = <${outputs}>;`,
    '    };',
  ];
}

/**
 * Shift registers on their own bus: SPI2, which shares hardware with no I2C
 * unit (so an OLED keeps working) and that no supported board uses otherwise.
 * The latch (RCLK) is the chip select; the 595 sends nothing back, so there's no MISO.
 */
function shiftRegisterBus(hw: KeyboardHardware): string | undefined {
  const pins = shiftPins(hw);
  if (!pins || pins.shared) return undefined;
  const { gpio } = interconnectOf(hw.controller);
  return [
    pinctrlNodes('shift_register_spi', [psel('SPIM_SCK', hw.controller, pins.clock), psel('SPIM_MOSI', hw.controller, pins.data)]),
    '',
    '&spi2 {',
    '    status = "okay";',
    '    compatible = "nordic,nrf-spim";',
    '    pinctrl-0 = <&shift_register_spi_default>;',
    '    pinctrl-1 = <&shift_register_spi_sleep>;',
    '    pinctrl-names = "default", "sleep";',
    `    cs-gpios = <&${gpio} ${pins.latch ?? '?'} GPIO_ACTIVE_LOW>;`,
    '',
    ...shifterNode(0, outputCount(hw)),
    '};',
  ].join('\n');
}
```

`niceViewBus`: when `sharesNiceViewBus(hw)`, write two chip selects and the shift register child:

```ts
function niceViewBus(hw: KeyboardHardware, pins: DisplayPin[]): string {
  const ic = interconnectOf(hw.controller);
  const cs = signalPin(pins, 'cs');
  const shared = sharesNiceViewBus(hw);
  const latch = hw.shiftRegisters?.latch ?? null;
  const csGpios = shared
    ? `    cs-gpios = <&${ic.gpio} ${cs ?? '?'} GPIO_ACTIVE_HIGH>, <&${ic.gpio} ${latch ?? '?'} GPIO_ACTIVE_LOW>;`
    : `    cs-gpios = <&${ic.gpio} ${cs ?? '?'} GPIO_ACTIVE_HIGH>;`;
  return [
    pinctrlNodes('nice_view_spi', [psel('SPIM_SCK', hw.controller, signalPin(pins, 'clock')), psel('SPIM_MOSI', hw.controller, signalPin(pins, 'data'))]),
    '',
    `nice_view_spi: &${ic.spi} {`,
    ...(shared ? ['    status = "okay";'] : []),
    '    compatible = "nordic,nrf-spim";',
    '    pinctrl-0 = <&nice_view_spi_default>;',
    '    pinctrl-1 = <&nice_view_spi_sleep>;',
    '    pinctrl-names = "default", "sleep";',
    csGpios,
    ...(shared ? ['', ...shifterNode(1, outputCount(hw))] : []),
    '};',
    '',
    `&${ic.i2c} {`,
    '    status = "disabled";',
    '};',
  ].join('\n');
}
```

(The shared case keeps the existing comment above the `&${ic.i2c}` block.)

`displaySection` → also append the own bus (one-piece files only):

```ts
function displaySection(hw: KeyboardHardware, withPins: boolean): string {
  if (!withPins) return '';
  const parts = [displayNodes(hw), shiftRegisterBus(hw)].filter((p): p is string => p !== undefined);
  return parts.map((p) => `\n${p}\n`).join('');
}
```

`kconfigDefconfig`, one-piece branch: add the SPI line after the trigger:

```ts
  const spi = hw.shiftRegisters ? '\nconfig SPI\n    default y\n' : '';
  if (!hw.split || !first || !second) return `# ${note(hw)}\n\nif ${first?.symbol ?? ''}\n\n${name}${trigger}${spi}\nendif\n${display}`;
```

- [ ] **Step 4: Run to see them pass**

Run the two files → PASS. Then `npm run typecheck && npm run lint && npx vitest run`: the existing golden snapshots and `test/customKeyboards.test.ts` file snapshots must be unchanged (no `-u`).

- [ ] **Step 5: Commit**

```bash
git add src/core/hardware/generate.ts src/core/hardware/generate.test.ts src/core/hardware/golden.test.ts
git commit -m "Shift registers: generate the bus, the 595 device and the matrix

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Wizard flow and basics step

**Files:**
- Modify: `src/ui/components/HardwareBasicsStep.tsx`
- Modify: `src/ui/components/HardwareWizard.tsx`
- Test: `src/ui/HardwareWizard.test.tsx`

**Interfaces:**
- Consumes: `HardwareBasics.shiftRegisters` (Task 3), `setShiftRegisterCount` (Task 1).
- Produces: a new keyboard whose draft already has outputs filled when leaving Basics.

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/HardwareWizard.test.tsx` (imports `testShiftPad`, `within`):

```tsx
describe('HardwareWizard shift registers', () => {
  it('offers shift registers for a one-piece matrix and fills the columns', async () => {
    const config = newHardwareConfig(testPad, 'v0.3');
    render(<HardwareWizard config={config} dispatch={vi.fn()} mode="create" onDone={vi.fn()} onCancel={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('switch', { name: /split keyboard/i }));
    await user.clear(screen.getByLabelText('Columns'));
    await user.type(screen.getByLabelText('Columns'), '10');
    await user.selectOptions(screen.getByLabelText('Shift registers (74HC595)'), '1');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('Column 0')).toHaveDisplayValue(/^Output 0 \(U1 QA\)/);
    expect(screen.getByLabelText('Column 8')).toHaveDisplayValue('No pin');
  });

  it('shows the count chosen on the Wiring step when going back to Basics, and keeps it', async () => {
    const config = newHardwareConfig(testShiftPad, 'v0.3');
    render(<HardwareWizard config={config} dispatch={vi.fn()} mode="edit" onDone={vi.fn()} onCancel={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const shift = screen.getByRole('group', { name: 'Shift registers' });
    await user.selectOptions(within(shift).getByLabelText('Number of shift registers'), '2');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Shift registers (74HC595)')).toHaveDisplayValue(/^2/);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(within(screen.getByRole('group', { name: 'Shift registers' })).getByLabelText('Number of shift registers')).toHaveDisplayValue(/^2/);
  });
});
```

(If the split control's accessible name differs, use the name `HardwareBasicsStep` renders: "Split keyboard (two halves)"; `Switch` renders `role="switch"`.)

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/ui/HardwareWizard.test.tsx` → FAIL (no "Shift registers (74HC595)" field). The second test also needs Task 6's fieldset; it's expected to fail until Task 6 and passes then.

- [ ] **Step 3: Implement**

`HardwareBasicsStep.tsx`, after the diode direction field:

```tsx
      {basics.wiring === 'matrix' && !basics.split && (
        <div className="field">
          <label className="field-label" htmlFor="hw-shift">Shift registers (74HC595)</label>
          <select id="hw-shift" className="input" aria-describedby="hw-shift-help" value={basics.shiftRegisters} onChange={(e) => set({ shiftRegisters: Number(e.target.value) })}>
            <option value={0}>None</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n} ({n * 8} outputs)
              </option>
            ))}
          </select>
          <p id="hw-shift-help" className="muted small">
            For more {basics.diodeDirection === 'col2row' ? 'columns' : 'rows'} than the controller has pins: a chain of 74HC595 chips drives up to 32 of them from three pins.
          </p>
        </div>
      )}
```

`HardwareWizard.tsx`:
- imports: `setShiftRegisterCount` from `../../core/hardware/shiftRegisters.ts`.
- the count basics asks for:

```ts
/** The shift register count the basics ask for: only one-piece matrix keyboards have them. */
const shiftCount = (b: HardwareBasics) => (b.wiring === 'matrix' && !b.split ? b.shiftRegisters : 0);
```

- `freshDraft`: `const hw = setShiftRegisterCount(gridHardware(basics), shiftCount(basics));` (it returns `hw` unchanged for 0 on a fresh grid without outputs).
- `leaveBasics`, else branch, after the matrix update:

```ts
      if ((next.shiftRegisters?.count ?? 0) !== shiftCount(basics)) next = setShiftRegisterCount(next, shiftCount(basics));
```

- going back to Basics shows the draft's current count (the Wiring step can change it):

```ts
  const goTo = (i: number) => {
    if (i === 0) setBasics((b) => ({ ...b, shiftRegisters: draft.hw.shiftRegisters?.count ?? 0 }));
    setStep(i);
  };
```

and use `goTo(i)` in the step buttons and `goTo(step - 1)` in the Back button.

- [ ] **Step 4: Run to see the first test pass**

Run: `npx vitest run src/ui/HardwareWizard.test.tsx -t "offers shift registers"` → PASS. Full check green except the second new test, which passes after Task 6.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/HardwareBasicsStep.tsx src/ui/components/HardwareWizard.tsx src/ui/HardwareWizard.test.tsx
git commit -m "Shift registers: basics step and wizard flow

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Wiring step, pinout and review

**Files:**
- Modify: `src/ui/components/HardwareWiringStep.tsx`
- Modify: `src/ui/components/ControllerPinout.tsx` (export `padClass`, shared bus)
- Modify: `src/ui/styles/hardware.css`
- Modify: `src/ui/components/HardwareReviewStep.tsx`
- Test: `src/ui/HardwareWizard.test.tsx`, `src/ui/ControllerPinout.test.ts` (new)

**Interfaces:**
- Consumes: `drivenList`, `outputCount`, `outputLabel`, `outputUses`, `isShiftOutput`, `shiftPins`, `setShiftRegisterCount`, `setShiftOwnBus`, `shiftSummary`, `MAX_SHIFT_REGISTERS` (Task 1); `setPin` with `shift.*` lists.
- Produces: the "Shift registers" fieldset (accessible name "Shift registers") with a select labelled "Number of shift registers", pin fields "Shift register latch", "Shift register data", "Shift register clock", and a checkbox "Shift registers on their own pins".

- [ ] **Step 1: Write the failing tests**

Create `src/ui/ControllerPinout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { padClass } from './components/ControllerPinout.tsx';

describe('padClass', () => {
  it('colours shift register pins, and a pin shared by the nice!view and the shift registers isn’t a clash', () => {
    expect(padClass(['Shift register latch'])).toBe('use-shift');
    expect(padClass(['Display data', 'Shift register data'])).toBe('use-shift');
    expect(padClass(['Display data', 'Shift register clock'])).toBe('use-clash');
    expect(padClass(['Row 0', 'Column 1'])).toBe('use-clash');
  });
});
```

Append to `HardwareWizard.test.tsx` (inside the `HardwareWizard shift registers` describe):

```tsx
  it('lists outputs only on driven lines, and shares data and clock with a nice!view', async () => {
    const config = newHardwareConfig(setDisplay(testShiftPad, undefined, 'nice_view'), 'v0.3');
    render(<HardwareWizard config={config} dispatch={vi.fn()} mode="edit" onDone={vi.fn()} onCancel={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(within(screen.getByLabelText('Column 9')).getByRole('option', { name: /Output 3 \(U1 QD\)/ })).toBeInTheDocument();
    expect(within(screen.getByLabelText('Row 0')).queryByRole('option', { name: /Output/ })).toBeNull();
    const shift = screen.getByRole('group', { name: 'Shift registers' });
    expect(within(shift).getByText('Shared with the nice!view (D2)')).toBeInTheDocument();
    await user.click(within(shift).getByLabelText('Shift registers on their own pins'));
    expect(within(shift).getByLabelText('Shift register data')).toHaveDisplayValue(/^D2/);
  });

  it('summarises the shift registers on the review step', async () => {
    render(<HardwareWizard config={newHardwareConfig(testShiftPad, 'v0.3')} dispatch={vi.fn()} mode="edit" onDone={vi.fn()} onCancel={vi.fn()} />);
    const user = userEvent.setup();
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Columns 0–7 on 1 shift register (74HC595)')).toBeInTheDocument();
  });
```

(import `setDisplay` from `../core/hardware/displays.ts`.)

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/ui/ControllerPinout.test.ts src/ui/HardwareWizard.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`ControllerPinout.tsx`: export `padClass` and handle shift registers and the shared bus:

```ts
/** "Display data" next to "Shift register data": one wire on a bus the two share, not a clash. */
const sharedBusPin = (uses: string[]) =>
  uses.length === 2 &&
  uses.some((u) => u.startsWith('Display ')) &&
  uses.some((u) => u.startsWith('Shift register ')) &&
  uses[0]?.split(' ').pop() === uses[1]?.split(' ').pop();

/** A pad's colour class from its uses: row (or direct input), column, encoder, display, shift register, free, or a clash. */
export function padClass(uses: string[] | undefined): string {
  const list = uses ?? [];
  if (sharedBusPin(list)) return 'use-shift';
  const [first = '', second] = list;
  if (second !== undefined) return 'use-clash';
  if (first.startsWith('Row') || first.startsWith('Input')) return 'use-row';
  if (first.startsWith('Column')) return 'use-col';
  if (first.startsWith('Encoder')) return 'use-encoder';
  if (first.startsWith('Display')) return 'use-display';
  if (first.startsWith('Shift register')) return 'use-shift';
  return 'use-free';
}
```

`hardware.css`, next to `.use-display` (update the comment above the pad rules to mention shift registers):

```css
.pinout-pad.used.use-shift {
  border-color: var(--kind-encoder);
  border-style: dashed;
}
```

`HardwareWiringStep.tsx`:
- `PinSelect`: `pin` prop becomes `LinePin`; the select value and options:

```tsx
  const driven = !hw.split && list === drivenList(hw);
  const outputs = driven ? outputCount(hw) : 0;
  const outUses = outputs > 0 || isShiftOutput(pin) ? outputUses(hw) : new Map<number, string[]>();
  const value = isShiftOutput(pin) ? `sr:${pin.sr}` : (pin ?? '');
  const parse = (v: string): LinePin => (v === '' ? null : v.startsWith('sr:') ? { sr: Number(v.slice(3)) } : Number(v));
```

```tsx
      <select
        id={id}
        className={`input${isActive ? ' active-pin' : ''}`}
        value={value}
        onPointerDown={() => onActivate({ side, list, index, label })}
        onChange={(e) => onChange(setPin(hw, side, list, index, parse(e.target.value)))}
      >
        <option value="">No pin</option>
        {pin !== null && !isShiftOutput(pin) && !pins.includes(pin) && <option value={pin}>{pinLabel(pin)} (not on this controller)</option>}
        {isShiftOutput(pin) && pin.sr >= outputs && <option value={value}>{outputLabel(pin.sr)} (not available)</option>}
        {pins.map((p) => {
          const other = (uses.get(p) ?? []).filter((use) => use !== name);
          return (
            <option key={p} value={p}>
              {pinLabel(p)}
              {other.length > 0 ? ` (${other.join(', ')})` : ''}
            </option>
          );
        })}
        {outputs > 0 && (
          <optgroup label="Shift register outputs">
            {Array.from({ length: outputs }, (_, n) => {
              const other = (outUses.get(n) ?? []).filter((use) => use !== name);
              return (
                <option key={`sr${n}`} value={`sr:${n}`}>
                  {outputLabel(n)}
                  {other.length > 0 ? ` (${other.join(', ')})` : ''}
                </option>
              );
            })}
          </optgroup>
        )}
      </select>
```

- `PinTables`: its `lists` entries and `field` helper take `LinePin` (`pins: LinePin[]`, `field = (list: PinList, index: number, name: string, pin: LinePin) => …`). After the row/column fieldsets and before Encoders, for `!hw.split && hw.wiring.kind === 'matrix'`:

```tsx
      {!hw.split && hw.wiring.kind === 'matrix' && <ShiftRegisterFields hw={hw} field={field} onChange={onChange} />}
```

and the component (same file):

```tsx
/** The 74HC595 chain: how many, and the latch, data and clock pins (shared with a nice!view unless on their own pins). */
function ShiftRegisterFields({
  hw,
  field,
  onChange,
}: {
  hw: KeyboardHardware;
  field: (list: PinList, index: number, name: string, pin: Pin) => ReactNode;
  onChange: (hw: KeyboardHardware) => void;
}) {
  const pins = shiftPins(hw);
  const niceView = halfDisplay(hw, undefined) === 'nice_view';
  return (
    <fieldset className="fieldset" aria-label="Shift registers">
      <legend>Shift registers</legend>
      <div className="field">
        <label className="field-label" htmlFor="shift-count">Number of shift registers</label>
        <select id="shift-count" className="input" value={hw.shiftRegisters?.count ?? 0} onChange={(e) => onChange(setShiftRegisterCount(hw, Number(e.target.value)))}>
          <option value={0}>None</option>
          {Array.from({ length: MAX_SHIFT_REGISTERS }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} ({n * 8} outputs)
            </option>
          ))}
        </select>
      </div>
      {pins && (
        <>
          <p className="muted small">
            Latch is the 595’s RCLK pin, data its SER and clock its SRCLK. U1 is the 595 wired to the controller; each one’s QH′ goes to the next one’s SER.
          </p>
          {niceView && (
            <label className="field checkbox">
              <input type="checkbox" checked={Boolean(hw.shiftRegisters?.ownBus)} onChange={(e) => onChange(setShiftOwnBus(hw, e.target.checked))} />
              <span>Shift registers on their own pins</span>
            </label>
          )}
          <div className="pin-grid">
            <div className="field">{field('shift.latch', 0, 'Shift register latch', pins.latch)}</div>
            {pins.shared ? (
              <>
                <p className="muted small">Shared with the nice!view (D{pins.data})</p>
                <p className="muted small">Shared with the nice!view (D{pins.clock})</p>
              </>
            ) : (
              <>
                <div className="field">{field('shift.data', 0, 'Shift register data', pins.data)}</div>
                <div className="field">{field('shift.clock', 0, 'Shift register clock', pins.clock)}</div>
              </>
            )}
          </div>
        </>
      )}
    </fieldset>
  );
}
```

Note: the test's first `getByText('Shared with the nice!view (D2)')` relies on data being D2 and clock D3 (distinct texts). Imports: `type ReactNode` from `react`; `halfDisplay` from displays; Task 1 helpers; `LinePin` type.

- `HardwareReviewStep.tsx`: after the summary paragraph:

```tsx
      {!hasErrors(issues) && shiftSummary(hw) && <p>{shiftSummary(hw)}</p>}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run src/ui` → PASS (including Task 5's second test). Full check green. Open the dev server (`npm run dev`) and walk the wizard once: one piece, 6 × 18, 2 shift registers, nice!view; confirm the fieldset, the shared texts and the pinout colours.

- [ ] **Step 5: Commit**

```bash
git add src/ui
git commit -m "Shift registers: wiring step, pinout and review

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Firmware build fixtures

**Files:**
- Modify: `test/customKeyboards.test.ts`
- Create (generated by the test): `test/generated/editor_shift/**`, `test/generated/editor_shift_view/**`, `test/generated/editor_shift_oled/**`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Add the keyboards**

In `test/customKeyboards.test.ts` (imports `setShiftRegisterCount` from `../src/core/hardware/shiftRegisters.ts`):

```ts
/** 3 × 12, COL2ROW, one 74HC595 on its own bus (data D2, clock D3, latch D21), columns 8–11 on pins. */
const shift: KeyboardHardware = (() => {
  const hw = setShiftRegisterCount(gridHardware({ ...DEFAULT_BASICS, name: 'editor_shift', displayName: 'Editor Shift', split: false, rows: 3, cols: 12 }), 1);
  const cols = (hw.wiring.kind === 'matrix' ? hw.wiring.cols : []).map((p, i) => (i >= 8 ? [7, 8, 9, 10][i - 8] ?? null : p));
  return { ...hw, wiring: { kind: 'matrix', diodeDirection: 'col2row', rows: [4, 5, 6], cols }, shiftRegisters: { count: 1, latch: 21 } };
})();

/** 2 × 16, two 595s sharing the nice!view's bus (CS D1, data D2, clock D3), latch D0. */
const shiftView: KeyboardHardware = {
  ...setShiftRegisterCount(gridHardware({ ...DEFAULT_BASICS, name: 'editor_shift_view', displayName: 'Editor Shift View', split: false, rows: 2, cols: 16 }), 2),
  shiftRegisters: { count: 2, latch: 0 },
  displays: { left: 'nice_view' },
};
shiftView.wiring = { kind: 'matrix', diodeDirection: 'col2row', rows: [4, 5], cols: Array.from({ length: 16 }, (_, i) => ({ sr: i })) };

/** A XIAO: 2 × 10, one 595 on its own bus (data D10, clock D8, latch D9) next to a 128×32 OLED on D4/D5. */
const shiftOled: KeyboardHardware = {
  ...gridHardware({ ...DEFAULT_BASICS, name: 'editor_shift_oled', displayName: 'Editor Shift OLED', controller: 'seeeduino_xiao_ble', split: false, rows: 2, cols: 10 }),
  wiring: { kind: 'matrix', diodeDirection: 'col2row', rows: [0, 1], cols: [...Array.from({ length: 8 }, (_, i) => ({ sr: i })), 2, 3] },
  shiftRegisters: { count: 1, latch: 9 },
  displays: { left: 'oled_128x32' },
};
```

and add them to the list: `describe.each([split, numpad, duo, shift, shiftView, shiftOled])`.

- [ ] **Step 2: Generate the fixtures**

Run: `npx vitest run test/customKeyboards.test.ts -u`
Expected: PASS, and new files under `test/generated/editor_shift*/`. Check that `test/generated/editor_shift_view/build.yaml` has `shield: editor_shift_view nice_view` (no adapter) and that the existing fixtures didn't change (`git status test/generated` shows only the three new folders).

- [ ] **Step 3: Run the full check**

Run: `npm run typecheck && npm run lint && npx vitest run` → green.

- [ ] **Step 4: Commit**

```bash
git add test
git commit -m "Shift registers: firmware build fixtures (own bus, shared with a nice!view, next to an OLED on a XIAO)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

After pushing, the `Firmware build check` workflow builds all fixtures with ZMK; all three new builds must pass.

---

### Task 8: Help and README

**Files:**
- Modify: `src/ui/help/sections/keyboard.tsx` (the `wizard` subsection)
- Modify: `README.md`

- [ ] **Step 1: Help**

In the `wizard` `<Sub>`, in the Wiring list item, change "plus encoders and displays (…)" to also mention shift registers, and add a paragraph after the `<ol>`:

```tsx
          <p>
            <strong>Shift registers.</strong> Out of pins on a big one-piece board? A chain of 74HC595 chips (up to four)
            drives up to 32 columns (rows on ROW2COL) from three pins: <strong>latch</strong> (the 595’s RCLK),{' '}
            <strong>data</strong> (SER) and <strong>clock</strong> (SRCLK). Choose how many on the Basics or Wiring step; the
            columns fill with <Ui>Output 0</Ui>, <Ui>Output 1</Ui>… and you can pick any output in a column’s list. Output 0
            is QA of the first chip (U1, the one wired to the controller), output 8 is QA of the next. With a nice!view, data
            and clock are shared with it unless you tick <Ui>Shift registers on their own pins</Ui>.
          </p>
```

- [ ] **Step 2: README**

In the "Any ZMK keyboard, or your own." item, change `(Pro Micro nRF52840 or Seeed XIAO nRF52840, matrix or direct wiring, split or one piece, encoders, nice!view or OLED)` to `(Pro Micro nRF52840 or Seeed XIAO nRF52840, matrix or direct wiring, split or one piece, 74HC595 shift registers for big one-piece boards, encoders, nice!view or OLED)`.

- [ ] **Step 3: Full check and commit**

Run: `npm run typecheck && npm run lint && npx vitest run` → green.

```bash
git add src/ui/help README.md
git commit -m "Shift registers: help and README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
