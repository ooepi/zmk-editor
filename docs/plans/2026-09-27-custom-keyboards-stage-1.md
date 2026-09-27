# Custom keyboards, Stage 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user can design a new keyboard from scratch and get a ZMK shield that GitHub Actions builds, and can edit its hardware later. The design covers: controller, split or unibody, matrix or direct wiring, pins, and where each key sits and how it's wired.

**Architecture:** A `KeyboardHardware` definition (`src/core/hardware/`) is the source of truth. It is saved as `config/boards/shields/<name>/<name>.editor.json`, and the shield files (Kconfig, `.overlay`/`.dtsi`, `.zmk.yml`) are generated from it on every `generateConfig`. `ZmkConfig` gets an optional `hardware` field, so undo, localStorage, zip export and commit work unchanged. A four-step wizard in the UI (Basics → Wiring → Layout → Review) creates the definition or edits it.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `erasableSyntaxOnly`), React 19, Vitest, Testing Library, and GitHub Actions with `zmkfirmware/zmk-build-arm:stable`.

**Spec:** [docs/specs/2026-09-27-custom-keyboards-design.md](../specs/2026-09-27-custom-keyboards-design.md)

## Global Constraints

- `src/core` never imports React or `src/ui` (enforced by ESLint).
- Controllers: nRF52840 boards with the Pro Micro footprint only. `HARDWARE_CONTROLLERS` = `CONTROLLER_DATA` entries with `ble` that expose `pro_micro`, minus `nrfmicro_13_52833`.
- Pins: the `&pro_micro` numbers 0–10, 14, 15, 16 and 18–21. They were checked against ZMK v0.3 for every board in the list.
- GPIO flags, checked against ZMK v0.3 shields:
  - matrix `col2row`: rows `(GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)`, columns `GPIO_ACTIVE_HIGH` (Corne);
  - matrix `row2col`: columns `(GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)`, rows `GPIO_ACTIVE_HIGH` (Hummingbird);
  - direct: `input-gpios` with `(GPIO_ACTIVE_LOW | GPIO_PULL_UP)` (Cradio).
- `zmk,physical-layout` **requires** `transform` (ZMK v0.3 binding), so it is always emitted.
- The right half of a split without `wiring.right` mirrors the left:
  - matrix: the same row pins, and the column pins in reverse order;
  - direct: the same input list, with keys assigned mirror-wise.
- Keyboard id: `/^[a-z][a-z0-9_]*$/`, and it can't be a catalog keyboard (`findKeyboard`). The display name is 1–16 characters, with no `"` or `\`.
- Keys in `hardware.keys` are in keymap order. That order is also the order of the matrix-transform `map` and of the physical layout.
- Follow the handoff conventions:
  - form fields use `<label htmlFor>` plus `aria-describedby`;
  - every edit goes through the reducer (`load` / `editConfig`);
  - commit messages explain why, end with the `Co-Authored-By` trailer the repo already uses, and have no model name in the subject.
- Before the PR: `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` all pass.

## Review Focus

1. **Mirrored right half:** the outer column on both halves must use the same pin. A test in Task 5 checks the right overlay's `col-gpios` order, and a test in Task 2 checks direct-wiring input assignment.
2. **Hardware edits that remove keys** must keep the keymap and combos in step. Task 6 has the `remapKeyPositions` tests, and Task 12 has the UI round trip, including undo.
3. **Resizing a mirrored matrix** after keys exist shifts the right-half columns. Task 1 has the `resizeMatrix` test.
4. **Shield files changed by hand in the repo** get a warning and need an explicit opt-in before they're overwritten (Tasks 7 and 9).
5. **Generated shields must actually compile.** Task 8 builds three fixtures (split matrix col2row, unibody matrix row2col, split direct with its own right-half pins) with real ZMK in CI.

## Deviations from the spec (decided while planning)

- The diode direction is chosen on the Basics step, with a sentence explaining which way the diode's band faces. The spec put it on the Wiring step with a picture. Text is enough for Stage 1, and a picture can come later.

- The shield devicetree files are printed with small template functions, not with `printNode`. They need Corne-style multi-line GPIO lists and a column-aligned `map`, and the generic printer puts everything on one line. `printTopLevel` stays in `keymap/generator.ts`.
- **"Edit hardware" can't change** the id, split/unibody or the wiring kind. Changing those would rename every file, and a commit can't delete old files. It can change:
  - the display name;
  - the controller;
  - the diode direction;
  - the matrix size;
  - the pins;
  - the keys.

---

## File structure

**Create — core** (`src/core/hardware/`):

| File | Holds |
| --- | --- |
| `types.ts` | `KeyboardHardware` and related types, `hardwareLayout()` |
| `controllers.ts` | the Pro Micro header, `PRO_MICRO_PINS`, `HARDWARE_CONTROLLERS`, `pinLabel`, `isNiceNano` |
| `wiring.ts` | effective pins per half, `setPin`, `setRightWiredDifferently`, `resizeMatrix`, `removeDirectPin`, `directInputUsed`, `pinUses`, `halves`, `halfSize` |
| `grid.ts` | `HardwareBasics`, `DEFAULT_BASICS`, `hardwareName`, `gridHardware`, `basicsOf` |
| `validate.ts` | `HardwareIssue`, `validateBasics`, `validateHardware` |
| `definition.ts` | `shieldDir`, `definitionPath`, `serializeHardware`, `parseHardware` |
| `generate.ts` | `generateShield`, `handEditedShieldFiles` |
| `keys.ts` | `addKey`, `deleteKey`, `remapKeyPositions` |
| `starter.ts` | `starterKeymap` |
| `config.ts` | `shieldNames`, `hardwareBuildTargets`, `newHardwareConfig`, `applyHardware` |
| `testFixtures.ts` | two small keyboards shared by core and UI tests |
| `*.test.ts` | next to each file |

**Create — the rest:**
- `test/customKeyboards.test.ts` — three fixtures, snapshotted into `test/generated/editor_*/`.
- UI (`src/ui/components/`):
  - `DesignerCanvas.tsx`, moved out of `LayoutDesigner.tsx`;
  - `HardwareWizard.tsx`, `HardwareBasicsStep.tsx`, `HardwareWiringStep.tsx`, `ProMicroPinout.tsx`, `HardwareLayoutStep.tsx`, `HardwareReviewStep.tsx`, `HardwareIssueList.tsx`.
- `src/ui/NewKeyboard.test.tsx`.

**Modify:**
- Core: `src/core/config.ts`, `src/core/layouts/dtsi.ts`.
- UI:
  - `src/ui/App.tsx`, `src/ui/components/KeyboardView.tsx`, `src/ui/components/LayoutDesigner.tsx`;
  - `src/ui/components/Toolbar.tsx`, `src/ui/components/ConnectSection.tsx`, `src/ui/components/BuildView.tsx`;
  - `src/ui/styles.css`.
- Tests: `src/ui/Build.test.tsx`, `src/ui/Milestone5.test.tsx`, `src/core/layouts/designer.test.ts`.
- CI and docs: `.github/workflows/firmware.yml`, `README.md`, `docs/HANDOFF.md`.

Run single test files with `npx vitest run <path>`.

---

### Task 1: Hardware types, Pro Micro pins and wiring helpers

**Files:**
- Create: `src/core/hardware/types.ts`, `src/core/hardware/controllers.ts`, `src/core/hardware/wiring.ts`
- Test: `src/core/hardware/controllers.test.ts`, `src/core/hardware/wiring.test.ts`

**Interfaces:**
- Consumes: `CONTROLLER_DATA`, `ControllerData` (`src/core/catalog/keyboards.data.ts`); `PhysicalKey`, `PhysicalLayout` (`src/core/layouts/types.ts`).
- Produces:
  - `types.ts`: `Pin`, `Side`, `DiodeDirection`, `HardwareKey`, `MatrixPins`, `MatrixWiring`, `DirectWiring`, `Wiring`, `KeyboardHardware`, `hardwareLayout(hw): PhysicalLayout`.
  - `controllers.ts`: `HeaderPad`, `PRO_MICRO_HEADER`, `PRO_MICRO_PINS: number[]`, `pinLabel(pin): string`, `HARDWARE_CONTROLLERS: ControllerData[]`, `isNiceNano(id): boolean`.
  - `wiring.ts`:
    - `PinList = 'rows' | 'cols' | 'pins'`;
    - `halves(hw): (Side | undefined)[]`;
    - `matrixPins(wiring, side?)`, `directPins(wiring, side?)`, `halfSize(hw, side?)`;
    - `setPin(hw, side, list, index, pin)`, `setRightWiredDifferently(hw, on)`;
    - `resizeMatrix(hw, rows, cols)`, `removeDirectPin(hw, side, index)`;
    - `directInputUsed(hw, side, index): boolean`, `pinUses(hw, side?): Map<number, string[]>`.

- [ ] **Step 1: Write `types.ts`** (types only plus one small function; it is covered by the tests below)

```ts
import type { PhysicalKey, PhysicalLayout } from '../layouts/types.ts';

/** A `&pro_micro` pin number, or null while none is picked yet. */
export type Pin = number | null;
export type Side = 'left' | 'right';
export type DiodeDirection = 'col2row' | 'row2col';

/** A key: where it's drawn, and the matrix position (or direct input) it's wired to. */
export interface HardwareKey extends PhysicalKey {
  /** Matrix row; always 0 for direct wiring. */
  row: number;
  /** Matrix column, or for direct wiring the index into the half's input pins. */
  col: number;
  /** The half it's on; split keyboards only. */
  side?: Side;
}

export interface MatrixPins {
  rows: Pin[];
  cols: Pin[];
}

export interface MatrixWiring {
  kind: 'matrix';
  diodeDirection: DiodeDirection;
  rows: Pin[];
  cols: Pin[];
  /** The right half's own pins; without it the right half mirrors the left. */
  right?: MatrixPins;
}

export interface DirectWiring {
  kind: 'direct';
  pins: Pin[];
  /** The right half's own pins; without it both halves use `pins`. */
  right?: Pin[];
}

export type Wiring = MatrixWiring | DirectWiring;

/** A keyboard designed in the editor; its ZMK shield is generated from this. */
export interface KeyboardHardware {
  /** Shield id: lowercase letters, digits and `_`, e.g. `my_split`. */
  name: string;
  /** Shown in the editor and used as the Bluetooth name (at most 16 characters). */
  displayName: string;
  /** ZMK board id of the controller, e.g. `nice_nano_v2`. */
  controller: string;
  split: boolean;
  wiring: Wiring;
  /** In keymap order. */
  keys: HardwareKey[];
}

/** The keys' positions as a physical layout. */
export function hardwareLayout(hw: KeyboardHardware): PhysicalLayout {
  return { name: hw.displayName, keys: hw.keys.map(({ x, y, w, h, r, rx, ry }) => ({ x, y, w, h, r, rx, ry })) };
}
```

- [ ] **Step 2: Write the failing tests** — `src/core/hardware/controllers.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { HARDWARE_CONTROLLERS, PRO_MICRO_HEADER, PRO_MICRO_PINS, pinLabel } from './controllers.ts';

describe('Pro Micro pins', () => {
  it('lists the 18 &pro_micro pins ZMK maps', () => {
    expect(PRO_MICRO_PINS).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 15, 16, 18, 19, 20, 21]);
    expect(PRO_MICRO_HEADER.left).toHaveLength(12);
    expect(PRO_MICRO_HEADER.right).toHaveLength(12);
    expect(pinLabel(4)).toBe('D4');
  });

  it('offers wireless nRF52840 Pro Micro controllers only', () => {
    const ids = HARDWARE_CONTROLLERS.map((c) => c.id);
    expect(ids).toContain('nice_nano_v2');
    expect(ids).toContain('puchi_ble_v1');
    expect(ids).not.toContain('sparkfun_pro_micro_rp2040');
    expect(ids).not.toContain('nrfmicro_13_52833');
    expect(ids).not.toContain('seeeduino_xiao_ble');
  });
});
```

`src/core/hardware/wiring.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { KeyboardHardware } from './types.ts';
import {
  directInputUsed,
  halfSize,
  matrixPins,
  pinUses,
  removeDirectPin,
  resizeMatrix,
  setPin,
  setRightWiredDifferently,
} from './wiring.ts';

const key = (row: number, col: number, side?: 'left' | 'right') => ({ x: 0, y: 0, w: 100, h: 100, r: 0, rx: 0, ry: 0, row, col, ...(side ? { side } : {}) });

const split: KeyboardHardware = {
  name: 'test_split',
  displayName: 'Test Split',
  controller: 'nice_nano_v2',
  split: true,
  wiring: { kind: 'matrix', diodeDirection: 'col2row', rows: [4], cols: [6, 7, 8] },
  keys: [key(0, 0, 'left'), key(0, 1, 'left'), key(0, 2, 'left'), key(0, 0, 'right'), key(0, 1, 'right'), key(0, 2, 'right')],
};

describe('wiring helpers', () => {
  it('mirrors the right half: same rows, columns reversed', () => {
    if (split.wiring.kind !== 'matrix') throw new Error('matrix expected');
    expect(matrixPins(split.wiring, 'left')).toEqual({ rows: [4], cols: [6, 7, 8] });
    expect(matrixPins(split.wiring, 'right')).toEqual({ rows: [4], cols: [8, 7, 6] });
    expect(halfSize(split, 'right')).toEqual({ rows: 1, cols: 3 });
  });

  it('makes the right half explicit when one of its pins is set', () => {
    const next = setPin(split, 'right', 'cols', 0, 9);
    expect(next.wiring).toMatchObject({ cols: [6, 7, 8], right: { rows: [4], cols: [9, 7, 6] } });
    expect(setPin(split, 'left', 'rows', 0, 5).wiring).toMatchObject({ rows: [5] });
  });

  it('turns the separate right-half table on from the mirrored pins, and off again', () => {
    const on = setRightWiredDifferently(split, true);
    expect(on.wiring).toMatchObject({ right: { rows: [4], cols: [8, 7, 6] } });
    expect(setRightWiredDifferently(on, false).wiring).not.toHaveProperty('right');
  });

  it('resizes a matrix and keeps mirrored right-half keys on their pins', () => {
    const bigger = resizeMatrix(split, 2, 4);
    expect(bigger.wiring).toMatchObject({ rows: [4, null], cols: [6, 7, 8, null] });
    // The new column is on the inner edge; right keys shift so they keep their mirrored pins.
    expect(bigger.keys.filter((k) => k.side === 'right').map((k) => k.col)).toEqual([1, 2, 3]);
    if (bigger.wiring.kind !== 'matrix') throw new Error('matrix expected');
    expect(matrixPins(bigger.wiring, 'right').cols[3]).toBe(6);
  });

  it('lists what each pin does', () => {
    expect([...pinUses(split, 'left')]).toEqual([[4, ['Row 0']], [6, ['Column 0']], [7, ['Column 1']], [8, ['Column 2']]]);
  });

  it('removes an unused direct input and renumbers the keys after it', () => {
    const pad: KeyboardHardware = {
      ...split,
      split: false,
      wiring: { kind: 'direct', pins: [4, 5, 6] },
      keys: [key(0, 0), key(0, 2)],
    };
    expect(directInputUsed(pad, undefined, 1)).toBe(false);
    const next = removeDirectPin(pad, undefined, 1);
    expect(next.wiring).toEqual({ kind: 'direct', pins: [4, 6] });
    expect(next.keys.map((k) => k.col)).toEqual([0, 1]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/core/hardware`
Expected: FAIL, with `Failed to resolve import "./controllers.ts"` / `"./wiring.ts"`.

- [ ] **Step 4: Write `controllers.ts`**

```ts
import { CONTROLLER_DATA, type ControllerData } from '../catalog/keyboards.data.ts';

/** A pad on the Pro Micro header; `pin` is the `&pro_micro` number, null for power pads. */
export interface HeaderPad {
  pin: number | null;
  label: string;
  /** The nRF52840 pin behind it on a nice!nano (ZMK's arduino_pro_micro_pins.dtsi). */
  niceNano?: string;
}

const pad = (pin: number, niceNano: string): HeaderPad => ({ pin, label: `D${pin}`, niceNano });
const power = (label: string): HeaderPad => ({ pin: null, label });

/** The header seen from above with USB at the top: each side's pads, top to bottom. */
export const PRO_MICRO_HEADER: { left: HeaderPad[]; right: HeaderPad[] } = {
  left: [
    pad(1, 'P0.06'), pad(0, 'P0.08'), power('GND'), power('GND'), pad(2, 'P0.17'), pad(3, 'P0.20'),
    pad(4, 'P0.22'), pad(5, 'P0.24'), pad(6, 'P1.00'), pad(7, 'P0.11'), pad(8, 'P1.04'), pad(9, 'P1.06'),
  ],
  right: [
    power('RAW'), power('GND'), power('RST'), power('VCC'), pad(21, 'P0.31'), pad(20, 'P0.29'),
    pad(19, 'P0.02'), pad(18, 'P1.15'), pad(15, 'P1.13'), pad(14, 'P1.11'), pad(16, 'P0.10'), pad(10, 'P0.09'),
  ],
};

/** Every `&pro_micro` pin; the same on every nRF52840 Pro Micro board in ZMK v0.3. */
export const PRO_MICRO_PINS: number[] = [...PRO_MICRO_HEADER.left, ...PRO_MICRO_HEADER.right]
  .flatMap((p) => (p.pin === null ? [] : [p.pin]))
  .sort((a, b) => a - b);

export const pinLabel = (pin: number) => `D${pin}`;

/** Wireless nRF52840 controllers with the Pro Micro footprint. */
export const HARDWARE_CONTROLLERS: ControllerData[] = CONTROLLER_DATA.filter(
  (c) => c.ble && c.exposes.includes('pro_micro') && !c.id.endsWith('_52833'),
);

export const isNiceNano = (controller: string) => controller === 'nice_nano' || controller === 'nice_nano_v2';
```

- [ ] **Step 5: Write `wiring.ts`**

```ts
import type { DirectWiring, HardwareKey, KeyboardHardware, MatrixPins, MatrixWiring, Pin, Side } from './types.ts';

export type PinList = 'rows' | 'cols' | 'pins';

/** The halves to generate: both on a split, one unnamed half otherwise. */
export function halves(hw: KeyboardHardware): (Side | undefined)[] {
  return hw.split ? ['left', 'right'] : [undefined];
}

/**
 * One half's matrix pins. Without `right`, the right half is a mirror image of
 * the left, like a reversible PCB: the same row pins and the column pins in
 * reverse order, so the outer column uses the same pin on both halves.
 */
export function matrixPins(wiring: MatrixWiring, side?: Side): MatrixPins {
  if (side !== 'right') return { rows: wiring.rows, cols: wiring.cols };
  return wiring.right ?? { rows: wiring.rows, cols: [...wiring.cols].reverse() };
}

/** One half's direct input pins; without `right` both halves use the same list. */
export function directPins(wiring: DirectWiring, side?: Side): Pin[] {
  return side === 'right' ? (wiring.right ?? wiring.pins) : wiring.pins;
}

/** A half's matrix size; direct wiring is one row with a column per input. */
export function halfSize(hw: KeyboardHardware, side?: Side): { rows: number; cols: number } {
  if (hw.wiring.kind === 'direct') return { rows: 1, cols: directPins(hw.wiring, side).length };
  const pins = matrixPins(hw.wiring, side);
  return { rows: pins.rows.length, cols: pins.cols.length };
}

function withoutRight<T extends { right?: unknown }>(wiring: T): T {
  const copy = { ...wiring };
  delete copy.right;
  return copy;
}

/** Sets one pin. Setting a pin on a mirrored right half gives it its own pins first. */
export function setPin(hw: KeyboardHardware, side: Side | undefined, list: PinList, index: number, pin: Pin): KeyboardHardware {
  const put = (pins: Pin[]) => pins.map((p, i) => (i === index ? pin : p));
  const wiring = hw.wiring;
  if (wiring.kind === 'direct') {
    if (side === 'right') return { ...hw, wiring: { ...wiring, right: put(directPins(wiring, 'right')) } };
    return { ...hw, wiring: { ...wiring, pins: put(wiring.pins) } };
  }
  const which = list === 'rows' ? 'rows' : 'cols';
  if (side === 'right') {
    const right = matrixPins(wiring, 'right');
    return { ...hw, wiring: { ...wiring, right: { ...right, [which]: put(right[which]) } } };
  }
  return { ...hw, wiring: { ...wiring, [which]: put(wiring[which]) } };
}

/** Gives the right half its own pins (starting from the mirrored ones), or makes it a mirror again. */
export function setRightWiredDifferently(hw: KeyboardHardware, on: boolean): KeyboardHardware {
  const wiring = hw.wiring;
  if (wiring.kind === 'direct') {
    return { ...hw, wiring: on ? { ...wiring, right: [...directPins(wiring, 'right')] } : withoutRight(wiring) };
  }
  return { ...hw, wiring: on ? { ...wiring, right: matrixPins(wiring, 'right') } : withoutRight(wiring) };
}

/** Resizes the matrix of both halves; new rows and columns have no pin yet. */
export function resizeMatrix(hw: KeyboardHardware, rows: number, cols: number): KeyboardHardware {
  const wiring = hw.wiring;
  if (wiring.kind !== 'matrix') return hw;
  const fit = (pins: Pin[], n: number): Pin[] => Array.from({ length: n }, (_, i) => pins[i] ?? null);
  const next: MatrixWiring = { ...wiring, rows: fit(wiring.rows, rows), cols: fit(wiring.cols, cols) };
  if (wiring.right) next.right = { rows: fit(wiring.right.rows, rows), cols: fit(wiring.right.cols, cols) };
  // A mirrored right half lists its columns in reverse, so its keys shift to keep their pins.
  const shift = hw.split && !wiring.right ? cols - wiring.cols.length : 0;
  const keys = shift ? hw.keys.map((k) => (k.side === 'right' ? { ...k, col: k.col + shift } : k)) : hw.keys;
  return { ...hw, wiring: next, keys };
}

/** Keys that read a half's direct input list (both halves share it when the right mirrors the left). */
function readsInputs(hw: KeyboardHardware, side: Side | undefined, key: HardwareKey): boolean {
  const shared = hw.wiring.kind === 'direct' && !hw.wiring.right;
  return !hw.split || shared || key.side === side;
}

export function directInputUsed(hw: KeyboardHardware, side: Side | undefined, index: number): boolean {
  return hw.keys.some((k) => k.col === index && readsInputs(hw, side, k));
}

/** Removes a direct input; keys on later inputs move down one. */
export function removeDirectPin(hw: KeyboardHardware, side: Side | undefined, index: number): KeyboardHardware {
  const wiring = hw.wiring;
  if (wiring.kind !== 'direct') return hw;
  const drop = (pins: Pin[]) => pins.filter((_, i) => i !== index);
  const next: DirectWiring = side === 'right' && wiring.right ? { ...wiring, right: drop(wiring.right) } : { ...wiring, pins: drop(wiring.pins) };
  const keys = hw.keys.map((k) => (readsInputs(hw, side, k) && k.col > index ? { ...k, col: k.col - 1 } : k));
  return { ...hw, wiring: next, keys };
}

/** What each pin is used for on a half, e.g. 4 → ["Row 0"]. */
export function pinUses(hw: KeyboardHardware, side?: Side): Map<number, string[]> {
  const uses = new Map<number, string[]>();
  const add = (pin: Pin, what: string) => {
    if (pin !== null) uses.set(pin, [...(uses.get(pin) ?? []), what]);
  };
  if (hw.wiring.kind === 'direct') {
    directPins(hw.wiring, side).forEach((pin, i) => add(pin, `Input ${i}`));
  } else {
    const pins = matrixPins(hw.wiring, side);
    pins.rows.forEach((pin, i) => add(pin, `Row ${i}`));
    pins.cols.forEach((pin, i) => add(pin, `Column ${i}`));
  }
  return uses;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/core/hardware`
Expected: PASS (8 tests).

- [ ] **Step 7: Commit**

```bash
git add src/core/hardware
git commit -m "Add hardware model, Pro Micro pins and wiring helpers for custom keyboards"
```
(Use a full message body that explains why, plus the repo's `Co-Authored-By` trailer. The same applies to every commit below.)

---

### Task 2: Starting grid from the basic choices

**Files:**
- Create: `src/core/hardware/grid.ts`
- Test: `src/core/hardware/grid.test.ts`

**Interfaces:**
- Consumes: the types from Task 1.
- Produces:
  - `HardwareBasics { displayName; name; controller; split; rows; cols; wiring: 'matrix' | 'direct'; diodeDirection }`;
  - `DEFAULT_BASICS: HardwareBasics`;
  - `hardwareName(displayName): string`;
  - `gridHardware(basics): KeyboardHardware`;
  - `basicsOf(hw): HardwareBasics`.

- [ ] **Step 1: Write the failing test** — `src/core/hardware/grid.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { basicsOf, DEFAULT_BASICS, gridHardware, hardwareName } from './grid.ts';
import { matrixPins } from './wiring.ts';

describe('gridHardware', () => {
  it('derives an id from the display name', () => {
    expect(hardwareName('My Split 2!')).toBe('my_split_2');
    expect(hardwareName('42 keys')).toBe('kb_42_keys');
    expect(hardwareName('!!!')).toBe('my_keyboard');
  });

  it('lays out a unibody matrix row by row, one position per key, no pins yet', () => {
    const hw = gridHardware({ ...DEFAULT_BASICS, split: false, rows: 2, cols: 2 });
    expect(hw.keys.map((k) => [k.x, k.y, k.row, k.col, k.side])).toEqual([
      [0, 0, 0, 0, undefined],
      [100, 0, 0, 1, undefined],
      [0, 100, 1, 0, undefined],
      [100, 100, 1, 1, undefined],
    ]);
    expect(hw.wiring).toEqual({ kind: 'matrix', diodeDirection: 'col2row', rows: [null, null], cols: [null, null] });
  });

  it('puts the right half two keys to the right; its outer column shares the left outer column pin', () => {
    const hw = gridHardware({ ...DEFAULT_BASICS, rows: 1, cols: 3 });
    expect(hw.keys.map((k) => [k.x, k.col, k.side])).toEqual([
      [0, 0, 'left'], [100, 1, 'left'], [200, 2, 'left'],
      [500, 0, 'right'], [600, 1, 'right'], [700, 2, 'right'],
    ]);
    const wired = { ...hw, wiring: { kind: 'matrix' as const, diodeDirection: 'col2row' as const, rows: [4], cols: [6, 7, 8] } };
    // Left outer = column 0 (x 0); right outer = column 2 (x 700): both use D6.
    expect(matrixPins(wired.wiring, 'right').cols[2]).toBe(6);
  });

  it('gives direct-wired keys one input each, mirrored on the right half', () => {
    const hw = gridHardware({ ...DEFAULT_BASICS, wiring: 'direct', rows: 1, cols: 3 });
    expect(hw.keys.map((k) => [k.row, k.col])).toEqual([[0, 0], [0, 1], [0, 2], [0, 2], [0, 1], [0, 0]]);
    expect(hw.wiring).toEqual({ kind: 'direct', pins: [null, null, null] });
  });

  it('reads the basics back from a keyboard', () => {
    const basics = { ...DEFAULT_BASICS, rows: 4, cols: 5 };
    expect(basicsOf(gridHardware(basics))).toEqual(basics);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/hardware/grid.test.ts`
Expected: FAIL, with `Failed to resolve import "./grid.ts"`.

- [ ] **Step 3: Write `grid.ts`**

```ts
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
const GAP = 2;

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

/** The basics of an existing keyboard, for editing it. Direct wiring reports one row of inputs. */
export function basicsOf(hw: KeyboardHardware): HardwareBasics {
  const size = halfSize(hw, hw.split ? 'left' : undefined);
  const direct = hw.wiring.kind === 'direct';
  // A direct grid made by gridHardware has rows × cols inputs; report the grid it came from when it fits.
  const rows = direct ? Math.max(1, new Set(hw.keys.map((k) => k.y)).size) : size.rows;
  const cols = direct ? Math.max(1, Math.round(size.cols / rows)) : size.cols;
  return {
    displayName: hw.displayName,
    name: hw.name,
    controller: hw.controller,
    split: hw.split,
    rows,
    cols,
    wiring: hw.wiring.kind,
    diodeDirection: hw.wiring.kind === 'matrix' ? hw.wiring.diodeDirection : 'col2row',
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/hardware/grid.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/hardware/grid.ts src/core/hardware/grid.test.ts
git commit -m "Start custom keyboards from a rows-by-columns grid"
```

---

### Task 3: Validation

**Files:**
- Create: `src/core/hardware/validate.ts`
- Test: `src/core/hardware/validate.test.ts`

**Interfaces:**
- Consumes:
  - `findKeyboard` (`src/core/catalog/keyboards.ts`);
  - `HARDWARE_CONTROLLERS`, `PRO_MICRO_PINS`;
  - `halves`, `halfSize`, `matrixPins`, `directPins`;
  - `HardwareBasics`.
- Produces:
  - `HardwareIssue { level: 'error' | 'warning'; area: 'basics' | 'wiring' | 'keys'; message: string; keys?: number[] }`;
  - `validateBasics(b): HardwareIssue[]`, `validateHardware(hw): HardwareIssue[]`;
  - `hasErrors(issues): boolean`.

- [ ] **Step 1: Write the failing test** — `src/core/hardware/validate.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_BASICS, gridHardware } from './grid.ts';
import type { KeyboardHardware } from './types.ts';
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/hardware/validate.test.ts`
Expected: FAIL, with `Failed to resolve import "./validate.ts"`.

- [ ] **Step 3: Write `validate.ts`**

```ts
import { findKeyboard } from '../catalog/keyboards.ts';
import { HARDWARE_CONTROLLERS, PRO_MICRO_PINS } from './controllers.ts';
import type { HardwareBasics } from './grid.ts';
import type { KeyboardHardware, Pin } from './types.ts';
import { directPins, halfSize, halves, matrixPins } from './wiring.ts';

export interface HardwareIssue {
  level: 'error' | 'warning';
  /** The wizard step that fixes it. */
  area: 'basics' | 'wiring' | 'keys';
  message: string;
  /** Keys involved, for highlighting. */
  keys?: number[];
}

const MAX_NAME = 16;

export const hasErrors = (issues: HardwareIssue[]) => issues.some((i) => i.level === 'error');

function identityIssues(name: string, displayName: string, controller: string): HardwareIssue[] {
  const messages: string[] = [];
  if (!/^[a-z][a-z0-9_]*$/.test(name)) messages.push(`The id “${name}” must start with a letter and use only a–z, 0–9 and _.`);
  else if (findKeyboard(name)) messages.push(`“${name}” is already a keyboard in ZMK; pick another id.`);
  if (!displayName.trim()) messages.push('Give the keyboard a name.');
  else if (displayName.length > MAX_NAME) messages.push(`The name “${displayName}” is longer than ${MAX_NAME} characters, the Bluetooth limit.`);
  if (/["\\]/.test(displayName)) messages.push('The name can’t contain " or \\.');
  if (!HARDWARE_CONTROLLERS.some((c) => c.id === controller)) messages.push(`${controller} isn’t a supported controller.`);
  return messages.map((message) => ({ level: 'error', area: 'basics', message }));
}

export function validateBasics(b: HardwareBasics): HardwareIssue[] {
  const issues = identityIssues(b.name, b.displayName, b.controller);
  const error = (message: string) => issues.push({ level: 'error', area: 'basics', message });
  if (!Number.isInteger(b.rows) || b.rows < 1) error('Use at least 1 row.');
  if (!Number.isInteger(b.cols) || b.cols < 1) error('Use at least 1 column.');
  if (issues.length > 0) return issues;
  const perHalf = b.split ? ' per half' : '';
  if (b.wiring === 'matrix' && b.rows + b.cols > PRO_MICRO_PINS.length) {
    error(`A ${b.rows} × ${b.cols} matrix needs ${b.rows + b.cols} pins${perHalf}, but the controller has ${PRO_MICRO_PINS.length}.`);
  }
  if (b.wiring === 'direct' && b.rows * b.cols > PRO_MICRO_PINS.length) {
    error(`Direct wiring for ${b.rows * b.cols} keys needs ${b.rows * b.cols} pins${perHalf}, but the controller has ${PRO_MICRO_PINS.length}.`);
  }
  return issues;
}

export function validateHardware(hw: KeyboardHardware): HardwareIssue[] {
  const issues = identityIssues(hw.name, hw.displayName, hw.controller);
  const add = (level: HardwareIssue['level'], area: HardwareIssue['area'], message: string, keys?: number[]) => {
    if (!issues.some((i) => i.message === message)) issues.push({ level, area, message, ...(keys ? { keys } : {}) });
  };
  if (hw.keys.length === 0) add('error', 'keys', 'The keyboard has no keys.');
  const direct = hw.wiring.kind === 'direct';

  for (const side of halves(hw)) {
    const where = side ? ` on the ${side} half` : '';

    // A mirrored right half uses the left's pins, so they're checked once.
    if (side !== 'right' || hw.wiring.right) {
      const labelled: { label: string; pin: Pin }[] =
        hw.wiring.kind === 'direct'
          ? directPins(hw.wiring, side).map((pin, i) => ({ label: `Input ${i}`, pin }))
          : [
              ...matrixPins(hw.wiring, side).rows.map((pin, i) => ({ label: `Row ${i}`, pin })),
              ...matrixPins(hw.wiring, side).cols.map((pin, i) => ({ label: `Column ${i}`, pin })),
            ];
      if (labelled.length > PRO_MICRO_PINS.length) {
        add('error', 'wiring', `The wiring${where} needs ${labelled.length} pins, but the controller has ${PRO_MICRO_PINS.length}.`);
      }
      const seen = new Map<number, string>();
      for (const { label, pin } of labelled) {
        const other = pin === null ? undefined : seen.get(pin);
        if (pin === null) add('error', 'wiring', `${label}${where} has no pin.`);
        else if (!PRO_MICRO_PINS.includes(pin)) add('error', 'wiring', `${label}${where} uses D${pin}, which isn’t a Pro Micro pin.`);
        else if (other !== undefined) add('error', 'wiring', `D${pin} is used for both ${other} and ${label}${where}.`);
        else seen.set(pin, label);
      }
    }

    const size = halfSize(hw, side);
    const onHalf = hw.keys.map((key, index) => ({ key, index })).filter(({ key }) => !hw.split || key.side === side);
    if (side && hw.keys.length > 0 && onHalf.length === 0) add('warning', 'keys', `The ${side} half has no keys.`);
    const taken = new Map<string, number>();
    for (const { key, index } of onHalf) {
      const inside = Number.isInteger(key.row) && Number.isInteger(key.col) && key.row >= 0 && key.col >= 0 && key.row < size.rows && key.col < size.cols;
      if (!inside) {
        add('error', 'keys', direct
          ? `Key ${index} uses input ${key.col}${where}, but there are only ${size.cols}.`
          : `Key ${index} is on row ${key.row}, column ${key.col}${where}, outside the ${size.rows} × ${size.cols} matrix.`, [index]);
        continue;
      }
      const spot = `${key.row},${key.col}`;
      const other = taken.get(spot);
      if (other === undefined) taken.set(spot, index);
      else add('error', 'keys', direct
        ? `Keys ${other} and ${index} both use input ${key.col}${where}.`
        : `Keys ${other} and ${index} are both on row ${key.row}, column ${key.col}${where}.`, [other, index]);
    }
    if (onHalf.length > 0) {
      const used = [...taken.keys()].map((s) => s.split(',').map(Number) as [number, number]);
      if (direct) {
        for (let c = 0; c < size.cols; c++) if (!used.some(([, col]) => col === c)) add('warning', 'keys', `Input ${c}${where} has no key.`);
      } else {
        for (let r = 0; r < size.rows; r++) if (!used.some(([row]) => row === r)) add('warning', 'keys', `Row ${r}${where} has no keys.`);
        for (let c = 0; c < size.cols; c++) if (!used.some(([, col]) => col === c)) add('warning', 'keys', `Column ${c}${where} has no keys.`);
      }
    }
  }
  if (hw.split) {
    hw.keys.forEach((key, index) => {
      if (key.side !== 'left' && key.side !== 'right') add('error', 'keys', `Key ${index} isn’t on a half.`, [index]);
    });
  }
  return issues;
}
```

Mirrored direct wiring: both halves share one input list, so an input that only the right half uses isn't reported as unused on the left. That's acceptable. The warning describes the half being checked.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/hardware/validate.test.ts`
Expected: PASS (7 tests). If a message differs, fix the code; the test holds the agreed wording.

- [ ] **Step 5: Commit**

```bash
git add src/core/hardware/validate.ts src/core/hardware/validate.test.ts
git commit -m "Validate custom keyboards: ids, pins, matrix positions"
```

---

### Task 4: The definition file, Kconfig and metadata

**Files:**
- Create: `src/core/hardware/definition.ts`, `src/core/hardware/generate.ts`, `src/core/hardware/testFixtures.ts` (two small keyboards that later tests share; a plain module, because importing a `.test.ts` file would run its tests again)
- Test: `src/core/hardware/definition.test.ts`, `src/core/hardware/generate.test.ts`

**Interfaces:**
- Consumes: `KeyboardHardware`; `isRecord`, `yamlScalar` (`src/core/files/yaml-util.ts`).
- Produces:
  - `shieldDir(name)`, `definitionPath(name)`;
  - `serializeHardware(hw): string`, `parseHardware(text): KeyboardHardware` (throws `Error` with a readable message);
  - `generateShield(hw): Record<string, string>` (Kconfig, `.zmk.yml`, the definition; Task 5 adds the devicetree files).

- [ ] **Step 1: Write the failing tests**

`src/core/hardware/definition.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { definitionPath, parseHardware, serializeHardware } from './definition.ts';
import { DEFAULT_BASICS, gridHardware } from './grid.ts';

const hw = { ...gridHardware({ ...DEFAULT_BASICS, name: 'test_split', displayName: 'Test Split', rows: 1, cols: 2 }), wiring: { kind: 'matrix' as const, diodeDirection: 'col2row' as const, rows: [4], cols: [6, 7] } };

describe('hardware definition file', () => {
  it('lives next to the shield files', () => {
    expect(definitionPath('test_split')).toBe('config/boards/shields/test_split/test_split.editor.json');
  });

  it('round-trips, with one key per line', () => {
    const text = serializeHardware(hw);
    expect(parseHardware(text)).toEqual(hw);
    expect(serializeHardware(parseHardware(text))).toBe(text);
    expect(text).toContain('\n    {"x":0,"y":0,"w":100,"h":100,"r":0,"rx":0,"ry":0,"row":0,"col":0,"side":"left"},\n');
    expect(text.startsWith('{\n  "version": 1,\n  "name": "test_split",')).toBe(true);
  });

  it('explains what is wrong with a bad file', () => {
    expect(() => parseHardware('nope')).toThrow();
    expect(() => parseHardware('{"version": 2}')).toThrow('version 2 isn’t supported; update the editor');
    expect(() => parseHardware(serializeHardware(hw).replace('"matrix"', '"charlieplex"'))).toThrow('wiring.kind must be matrix or direct');
  });
});
```

`src/core/hardware/testFixtures.ts`:

```ts
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
```

`src/core/hardware/generate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { generateShield } from './generate.ts';
import { testPad, testSplit } from './testFixtures.ts';
import type { KeyboardHardware } from './types.ts';

const dir = (name: string) => `config/boards/shields/${name}`;

describe('generateShield: Kconfig and metadata', () => {
  it('writes the split Kconfig files like ZMK’s own split shields', () => {
    const files = generateShield(testSplit);
    expect(files[`${dir('test_split')}/Kconfig.shield`]).toBe(`# Generated by ZMK Editor from test_split.editor.json.

config SHIELD_TEST_SPLIT_LEFT
    def_bool $(shields_list_contains,test_split_left)

config SHIELD_TEST_SPLIT_RIGHT
    def_bool $(shields_list_contains,test_split_right)
`);
    expect(files[`${dir('test_split')}/Kconfig.defconfig`]).toBe(`# Generated by ZMK Editor from test_split.editor.json.

if SHIELD_TEST_SPLIT_LEFT

config ZMK_KEYBOARD_NAME
    default "Test Split"

config ZMK_SPLIT_ROLE_CENTRAL
    default y

endif

if SHIELD_TEST_SPLIT_LEFT || SHIELD_TEST_SPLIT_RIGHT

config ZMK_SPLIT
    default y

endif
`);
    expect(files[`${dir('test_split')}/test_split.zmk.yml`]).toBe(`# Generated by ZMK Editor from test_split.editor.json.
file_format: "1"
id: test_split
name: Test Split
type: shield
requires: [pro_micro]
features:
  - keys
siblings:
  - test_split_left
  - test_split_right
`);
  });

  it('writes a unibody keyboard as a single shield', () => {
    const files = generateShield(testPad);
    expect(files[`${dir('test_pad')}/Kconfig.shield`]).toBe(`# Generated by ZMK Editor from test_pad.editor.json.

config SHIELD_TEST_PAD
    def_bool $(shields_list_contains,test_pad)
`);
    expect(files[`${dir('test_pad')}/Kconfig.defconfig`]).toBe(`# Generated by ZMK Editor from test_pad.editor.json.

if SHIELD_TEST_PAD

config ZMK_KEYBOARD_NAME
    default "Test Pad"

endif
`);
    expect(files[`${dir('test_pad')}/test_pad.zmk.yml`]).not.toContain('siblings');
    expect(files[`${dir('test_pad')}/test_pad.editor.json`]).toContain('"name": "test_pad"');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/hardware/definition.test.ts src/core/hardware/generate.test.ts`
Expected: FAIL, with unresolved imports.

- [ ] **Step 3: Write `definition.ts`**

```ts
import { isRecord } from '../files/yaml-util.ts';
import type { DirectWiring, HardwareKey, KeyboardHardware, MatrixWiring, Pin, Wiring } from './types.ts';

const VERSION = 1;

export const shieldDir = (name: string) => `config/boards/shields/${name}`;
export const definitionPath = (name: string) => `${shieldDir(name)}/${name}.editor.json`;

/** The definition as JSON with a fixed field order and one key per line. */
export function serializeHardware(hw: KeyboardHardware): string {
  const w = hw.wiring;
  const wiring =
    w.kind === 'matrix'
      ? { kind: w.kind, diodeDirection: w.diodeDirection, rows: w.rows, cols: w.cols, ...(w.right ? { right: { rows: w.right.rows, cols: w.right.cols } } : {}) }
      : { kind: w.kind, pins: w.pins, ...(w.right ? { right: w.right } : {}) };
  const head = JSON.stringify(
    { version: VERSION, name: hw.name, displayName: hw.displayName, controller: hw.controller, split: hw.split, wiring, keys: [] },
    null,
    2,
  );
  const keys = hw.keys.map(({ x, y, w: width, h, r, rx, ry, row, col, side }) =>
    JSON.stringify({ x, y, w: width, h, r, rx, ry, row, col, ...(side ? { side } : {}) }),
  );
  const list = keys.length > 0 ? `[\n${keys.map((k) => `    ${k}`).join(',\n')}\n  ]` : '[]';
  return `${head.replace('"keys": []', `"keys": ${list}`)}\n`;
}

export function parseHardware(text: string): KeyboardHardware {
  const data: unknown = JSON.parse(text);
  if (!isRecord(data)) throw new Error('it isn’t a JSON object');
  if (data.version !== VERSION) throw new Error(`version ${String(data.version)} isn’t supported; update the editor`);
  const str = (value: unknown, what: string): string => {
    if (typeof value !== 'string') throw new Error(`${what} is missing`);
    return value;
  };
  const num = (value: unknown, what: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${what} must be a number`);
    return value;
  };
  const pins = (value: unknown, what: string): Pin[] => {
    if (!Array.isArray(value)) throw new Error(`${what} must be a list of pins`);
    return value.map((p: unknown) => (p === null ? null : num(p, what)));
  };

  const w = data.wiring;
  if (!isRecord(w)) throw new Error('wiring is missing');
  let wiring: Wiring;
  if (w.kind === 'matrix') {
    if (w.diodeDirection !== 'col2row' && w.diodeDirection !== 'row2col') throw new Error('diodeDirection must be col2row or row2col');
    const matrix: MatrixWiring = { kind: 'matrix', diodeDirection: w.diodeDirection, rows: pins(w.rows, 'wiring.rows'), cols: pins(w.cols, 'wiring.cols') };
    if (w.right !== undefined) {
      if (!isRecord(w.right)) throw new Error('wiring.right must be an object');
      matrix.right = { rows: pins(w.right.rows, 'wiring.right.rows'), cols: pins(w.right.cols, 'wiring.right.cols') };
    }
    wiring = matrix;
  } else if (w.kind === 'direct') {
    const direct: DirectWiring = { kind: 'direct', pins: pins(w.pins, 'wiring.pins') };
    if (w.right !== undefined) direct.right = pins(w.right, 'wiring.right');
    wiring = direct;
  } else {
    throw new Error('wiring.kind must be matrix or direct');
  }

  if (!Array.isArray(data.keys)) throw new Error('keys is missing');
  const keys = data.keys.map((k: unknown, i: number): HardwareKey => {
    if (!isRecord(k)) throw new Error(`key ${i} isn’t an object`);
    const n = (field: string) => num(k[field], `key ${i} ${field}`);
    const key: HardwareKey = { x: n('x'), y: n('y'), w: n('w'), h: n('h'), r: n('r'), rx: n('rx'), ry: n('ry'), row: n('row'), col: n('col') };
    if (k.side === 'left' || k.side === 'right') key.side = k.side;
    return key;
  });
  return {
    name: str(data.name, 'name'),
    displayName: str(data.displayName, 'displayName'),
    controller: str(data.controller, 'controller'),
    split: data.split === true,
    wiring,
    keys,
  };
}
```

- [ ] **Step 4: Write `generate.ts`** (Kconfig, metadata and definition; Task 5 adds the devicetree)

```ts
import { yamlScalar } from '../files/yaml-util.ts';
import { definitionPath, serializeHardware, shieldDir } from './definition.ts';
import type { KeyboardHardware } from './types.ts';

const note = (hw: KeyboardHardware) => `Generated by ZMK Editor from ${hw.name}.editor.json.`;

/** Each shield ZMK builds: `<name>_left`/`_right` on a split, else `<name>`. */
function shields(hw: KeyboardHardware): { shield: string; symbol: string }[] {
  const names = hw.split ? [`${hw.name}_left`, `${hw.name}_right`] : [hw.name];
  return names.map((shield) => ({ shield, symbol: `SHIELD_${shield.toUpperCase()}` }));
}

function kconfigShield(hw: KeyboardHardware): string {
  const entries = shields(hw).map(({ shield, symbol }) => `config ${symbol}\n    def_bool $(shields_list_contains,${shield})\n`);
  return `# ${note(hw)}\n\n${entries.join('\n')}`;
}

function kconfigDefconfig(hw: KeyboardHardware): string {
  const [first, second] = shields(hw);
  const name = `config ZMK_KEYBOARD_NAME\n    default "${hw.displayName}"\n`;
  if (!hw.split || !first || !second) return `# ${note(hw)}\n\nif ${first?.symbol ?? ''}\n\n${name}\nendif\n`;
  return `# ${note(hw)}

if ${first.symbol}

${name}
config ZMK_SPLIT_ROLE_CENTRAL
    default y

endif

if ${first.symbol} || ${second.symbol}

config ZMK_SPLIT
    default y

endif
`;
}

function zmkYml(hw: KeyboardHardware): string {
  const lines = [
    `# ${note(hw)}`,
    'file_format: "1"',
    `id: ${hw.name}`,
    `name: ${yamlScalar(hw.displayName)}`,
    'type: shield',
    'requires: [pro_micro]',
    'features:',
    '  - keys',
  ];
  if (hw.split) lines.push('siblings:', ...shields(hw).map(({ shield }) => `  - ${shield}`));
  return `${lines.join('\n')}\n`;
}

/** Every file of the keyboard's shield, keyed by repo path. */
export function generateShield(hw: KeyboardHardware): Record<string, string> {
  const dir = shieldDir(hw.name);
  return {
    [`${dir}/Kconfig.shield`]: kconfigShield(hw),
    [`${dir}/Kconfig.defconfig`]: kconfigDefconfig(hw),
    [`${dir}/${hw.name}.zmk.yml`]: zmkYml(hw),
    [definitionPath(hw.name)]: serializeHardware(hw),
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/core/hardware/definition.test.ts src/core/hardware/generate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/core/hardware/definition.ts src/core/hardware/generate.ts src/core/hardware/testFixtures.ts src/core/hardware/definition.test.ts src/core/hardware/generate.test.ts
git commit -m "Save custom keyboards as JSON and generate their Kconfig and metadata"
```

---

### Task 5: The shield devicetree (kscan, matrix transform, physical layout)

**Files:**
- Modify: `src/core/layouts/dtsi.ts` (extract `physicalLayoutNode`, `layoutLabel`), `src/core/hardware/generate.ts`
- Test: `src/core/layouts/designer.test.ts` (a characterization test, added first), `src/core/hardware/generate.test.ts`

**Interfaces:**
- Consumes: `textLayoutFromPhysical` (`src/core/layouts/derive.ts`), `hardwareLayout`, `matrixPins`, `directPins`, `halfSize`.
- Produces:
  - `layoutLabel(name): string`;
  - `physicalLayoutNode(layout, name, displayName?, extra?: string[]): string`;
  - `generateShield` now also writes `<name>.overlay` (unibody), or `<name>.dtsi` plus `<name>_left.overlay` and `<name>_right.overlay` (split).

- [ ] **Step 1: Pin the current `layoutDtsi` output** — add this to the existing `describe` that uses `layoutDtsi` in `src/core/layouts/designer.test.ts`

```ts
  it('prints the whole node exactly (guards the refactor for custom keyboards)', () => {
    expect(layoutDtsi(layout, 'my_board')).toBe(`#include <physical_layouts.dtsi>

/ {
    my_board_layout: my_board_layout {
        compatible = "zmk,physical-layout";
        display-name = "my_board";

        keys  //                     w   h    x    y     rot   rx   ry
            = <&key_physical_attrs 100 100    0    0      0    0    0>
            , <&key_physical_attrs 150 100  125   25   1500  200   75>
            ;
    };
};
`);
  });
```

Run: `npx vitest run src/core/layouts/designer.test.ts`
Expected: PASS. It describes today's output.

- [ ] **Step 2: Refactor `src/core/layouts/dtsi.ts`** so the node can be reused (the output stays identical)

```ts
import type { PhysicalLayout } from './types.ts';

export const layoutLabel = (name: string) => `${name.replace(/[^A-Za-z0-9_]/g, '_')}_layout`;

/**
 * A `zmk,physical-layout` node, indented for a root `/ { … }` block (1/100 key
 * units, rotation in centi-degrees). `extra` properties go after display-name.
 */
export function physicalLayoutNode(layout: PhysicalLayout, name: string, displayName = name, extra: string[] = []): string {
  const label = layoutLabel(name);
  const rows = layout.keys.map((k, i) => {
    const rot = Math.round(k.r * 100);
    const cells = [
      String(k.w).padStart(3),
      String(k.h).padStart(3),
      String(k.x).padStart(4),
      String(k.y).padStart(4),
      (rot < 0 ? `(${rot})` : String(rot)).padStart(6),
      String(k.rx).padStart(4),
      String(k.ry).padStart(4),
    ];
    return `            ${i === 0 ? '=' : ','} <&key_physical_attrs ${cells.join(' ')}>`;
  });
  return [
    `    ${label}: ${label} {`,
    '        compatible = "zmk,physical-layout";',
    `        display-name = "${displayName}";`,
    ...extra.map((line) => `        ${line}`),
    '',
    '        keys  //                     w   h    x    y     rot   rx   ry',
    ...rows,
    '            ;',
    '    };',
  ].join('\n');
}

/** A ZMK `zmk,physical-layout` node to paste into a shield definition. */
export function layoutDtsi(layout: PhysicalLayout, name: string): string {
  return `#include <physical_layouts.dtsi>\n\n/ {\n${physicalLayoutNode(layout, name)}\n};\n`;
}
```

Run: `npx vitest run src/core/layouts`
Expected: PASS, and the Step 1 test is unchanged.

- [ ] **Step 3: Write the failing devicetree tests** — append to `src/core/hardware/generate.test.ts`

```ts
describe('generateShield: devicetree', () => {
  it('writes a unibody direct-wired keyboard as one overlay', () => {
    expect(generateShield(testPad)[`${dir('test_pad')}/test_pad.overlay`]).toBe(`/* Generated by ZMK Editor from test_pad.editor.json. */

#include <dt-bindings/zmk/matrix_transform.h>
#include <physical_layouts.dtsi>

/ {
    chosen {
        zmk,kscan = &kscan0;
        zmk,physical-layout = &test_pad_layout;
    };

    kscan0: kscan {
        compatible = "zmk,kscan-gpio-direct";
        wakeup-source;

        input-gpios
            = <&pro_micro  4 (GPIO_ACTIVE_LOW | GPIO_PULL_UP)>
            , <&pro_micro  5 (GPIO_ACTIVE_LOW | GPIO_PULL_UP)>
            ;
    };

    default_transform: keymap_transform_0 {
        compatible = "zmk,matrix-transform";
        rows = <1>;
        columns = <2>;
        map = <
RC(0,0) RC(0,1)
        >;
    };

    test_pad_layout: test_pad_layout {
        compatible = "zmk,physical-layout";
        display-name = "Test Pad";
        transform = <&default_transform>;

        keys  //                     w   h    x    y     rot   rx   ry
            = <&key_physical_attrs 100 100    0    0      0    0    0>
            , <&key_physical_attrs 100 100  100    0      0    0    0>
            ;
    };
};
`);
  });

  it('writes a split as a shared .dtsi and one overlay per half, the right one mirrored and offset', () => {
    const files = generateShield(testSplit);
    expect(Object.keys(files).sort()).toEqual([
      `${dir('test_split')}/Kconfig.defconfig`,
      `${dir('test_split')}/Kconfig.shield`,
      `${dir('test_split')}/test_split.dtsi`,
      `${dir('test_split')}/test_split.editor.json`,
      `${dir('test_split')}/test_split.zmk.yml`,
      `${dir('test_split')}/test_split_left.overlay`,
      `${dir('test_split')}/test_split_right.overlay`,
    ]);
    const dtsi = files[`${dir('test_split')}/test_split.dtsi`] ?? '';
    expect(dtsi).toContain(`    kscan0: kscan {
        compatible = "zmk,kscan-gpio-matrix";
        wakeup-source;
        diode-direction = "col2row";
    };`);
    expect(dtsi).toContain(`        rows = <1>;
        columns = <4>;
        map = <
RC(0,0) RC(0,1) RC(0,2) RC(0,3)
        >;`);
    expect(files[`${dir('test_split')}/test_split_left.overlay`]).toBe(`/* Generated by ZMK Editor from test_split.editor.json. */

#include "test_split.dtsi"

&kscan0 {
    row-gpios
        = <&pro_micro  4 (GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)>
        ;

    col-gpios
        = <&pro_micro  6 GPIO_ACTIVE_HIGH>
        , <&pro_micro  7 GPIO_ACTIVE_HIGH>
        ;
};
`);
    expect(files[`${dir('test_split')}/test_split_right.overlay`]).toBe(`/* Generated by ZMK Editor from test_split.editor.json. */

#include "test_split.dtsi"

&default_transform {
    col-offset = <2>;
};

&kscan0 {
    row-gpios
        = <&pro_micro  4 (GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)>
        ;

    col-gpios
        = <&pro_micro  7 GPIO_ACTIVE_HIGH>
        , <&pro_micro  6 GPIO_ACTIVE_HIGH>
        ;
};
`);
  });

  it('puts the pull-down on the columns for row2col diodes', () => {
    const rowToCol: KeyboardHardware = { ...testSplit, wiring: { kind: 'matrix', diodeDirection: 'row2col', rows: [4], cols: [6, 7] } };
    const left = generateShield(rowToCol)[`${dir('test_split')}/test_split_left.overlay`];
    expect(left).toContain('row-gpios\n        = <&pro_micro  4 GPIO_ACTIVE_HIGH>');
    expect(left).toContain('col-gpios\n        = <&pro_micro  6 (GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)>');
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/core/hardware/generate.test.ts`
Expected: FAIL. The overlay and `.dtsi` keys are `undefined`.

- [ ] **Step 5: Add the devicetree to `generate.ts`**

Add these imports at the top of the file:

```ts
import { textLayoutFromPhysical } from '../layouts/derive.ts';
import { layoutLabel, physicalLayoutNode } from '../layouts/dtsi.ts';
import { hardwareLayout, type Pin, type Side } from './types.ts';
import { directPins, halfSize, matrixPins } from './wiring.ts';
```

Merge the `hardwareLayout`/`Pin`/`Side` import with the existing `import type { KeyboardHardware }`. Then add these functions above `generateShield`:

```ts
// Flags as in ZMK's own shields (v0.3): the pins the matrix reads get the pull-down.
const INPUT = '(GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)';
const OUTPUT = 'GPIO_ACTIVE_HIGH';
const DIRECT = '(GPIO_ACTIVE_LOW | GPIO_PULL_UP)';

function gpioList(property: string, pins: Pin[], flags: string, indent: string): string {
  const entries = pins.map((pin, i) => `${indent}    ${i === 0 ? '=' : ','} <&pro_micro ${String(pin ?? '?').padStart(2)} ${flags}>`);
  return [`${indent}${property}`, ...entries, `${indent}    ;`].join('\n');
}

function kscanPins(hw: KeyboardHardware, side: Side | undefined, indent: string): string {
  if (hw.wiring.kind === 'direct') return gpioList('input-gpios', directPins(hw.wiring, side), DIRECT, indent);
  const { rows, cols } = matrixPins(hw.wiring, side);
  const rowsRead = hw.wiring.diodeDirection === 'col2row';
  return [gpioList('row-gpios', rows, rowsRead ? INPUT : OUTPUT, indent), gpioList('col-gpios', cols, rowsRead ? OUTPUT : INPUT, indent)].join('\n\n');
}

function kscanNode(hw: KeyboardHardware, withPins: boolean): string {
  const lines = ['    kscan0: kscan {'];
  if (hw.wiring.kind === 'direct') lines.push('        compatible = "zmk,kscan-gpio-direct";', '        wakeup-source;');
  else lines.push('        compatible = "zmk,kscan-gpio-matrix";', '        wakeup-source;', `        diode-direction = "${hw.wiring.diodeDirection}";`);
  if (withPins) lines.push('', kscanPins(hw, undefined, '        '));
  lines.push('    };');
  return lines.join('\n');
}

/** The matrix transform, its `map` laid out like the keys. Right-half columns come after the left's. */
function transformNode(hw: KeyboardHardware): string {
  const left = halfSize(hw, hw.split ? 'left' : undefined);
  const right = hw.split ? halfSize(hw, 'right') : { rows: 0, cols: 0 };
  const cells = hw.keys.map((k) => `RC(${k.row},${k.col + (k.side === 'right' ? left.cols : 0)})`);
  const grid = textLayoutFromPhysical(hardwareLayout(hw))?.rows ?? [];
  const width = Math.max(0, ...cells.map((c) => c.length));
  const map = grid.map((row) => row.map((i) => (i === null ? '' : (cells[i] ?? ''))).map((c) => c.padEnd(width)).join(' ').trimEnd());
  return [
    '    default_transform: keymap_transform_0 {',
    '        compatible = "zmk,matrix-transform";',
    `        rows = <${Math.max(left.rows, right.rows)}>;`,
    `        columns = <${left.cols + right.cols}>;`,
    '        map = <',
    ...map,
    '        >;',
    '    };',
  ].join('\n');
}

function rootFile(hw: KeyboardHardware, withPins: boolean): string {
  return `/* ${note(hw)} */

#include <dt-bindings/zmk/matrix_transform.h>
#include <physical_layouts.dtsi>

/ {
    chosen {
        zmk,kscan = &kscan0;
        zmk,physical-layout = &${layoutLabel(hw.name)};
    };

${kscanNode(hw, withPins)}

${transformNode(hw)}

${physicalLayoutNode(hardwareLayout(hw), hw.name, hw.displayName, ['transform = <&default_transform>;'])}
};
`;
}

function halfOverlay(hw: KeyboardHardware, side: Side): string {
  const parts = [`/* ${note(hw)} */`, `#include "${hw.name}.dtsi"`];
  if (side === 'right') parts.push(`&default_transform {\n    col-offset = <${halfSize(hw, 'left').cols}>;\n};`);
  parts.push(`&kscan0 {\n${kscanPins(hw, side, '    ')}\n};`);
  return `${parts.join('\n\n')}\n`;
}
```

Extend `generateShield`:

```ts
export function generateShield(hw: KeyboardHardware): Record<string, string> {
  const dir = shieldDir(hw.name);
  const files: Record<string, string> = {
    [`${dir}/Kconfig.shield`]: kconfigShield(hw),
    [`${dir}/Kconfig.defconfig`]: kconfigDefconfig(hw),
    [`${dir}/${hw.name}.zmk.yml`]: zmkYml(hw),
    [definitionPath(hw.name)]: serializeHardware(hw),
  };
  if (hw.split) {
    files[`${dir}/${hw.name}.dtsi`] = rootFile(hw, false);
    files[`${dir}/${hw.name}_left.overlay`] = halfOverlay(hw, 'left');
    files[`${dir}/${hw.name}_right.overlay`] = halfOverlay(hw, 'right');
  } else {
    files[`${dir}/${hw.name}.overlay`] = rootFile(hw, true);
  }
  return files;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/core/hardware src/core/layouts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/layouts/dtsi.ts src/core/layouts/designer.test.ts src/core/hardware/generate.ts src/core/hardware/generate.test.ts
git commit -m "Generate the shield devicetree: kscan, matrix transform and physical layout"
```

---

### Task 6: Starter keymap, adding and deleting keys, and keeping the keymap in step

**Files:**
- Create: `src/core/hardware/starter.ts`, `src/core/hardware/keys.ts`
- Test: `src/core/hardware/keys.test.ts`

**Interfaces:**
- Consumes: `emptyKeymap`, `KeymapModel`, `Combo` (`src/core/keymap/model.ts`); `createCombo` (tests only); `directPins`, `halfSize`.
- Produces:
  - `starterKeymap(hw): KeymapModel`;
  - `addKey(hw, side?): KeyboardHardware`, `deleteKey(hw, index): KeyboardHardware`;
  - `remapKeyPositions(model, newToOld: (number | undefined)[]): { model: KeymapModel; notes: string[] }`.

- [ ] **Step 1: Write the failing test** — `src/core/hardware/keys.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { formatBinding } from '../keymap/bindings.ts';
import { createCombo } from '../keymap/comboEdit.ts';
import { generateKeymap } from '../keymap/generator.ts';
import { importKeymap } from '../keymap/importer.ts';
import { DEFAULT_BASICS, gridHardware } from './grid.ts';
import { addKey, deleteKey, remapKeyPositions } from './keys.ts';
import { starterKeymap } from './starter.ts';

const pad = { ...gridHardware({ ...DEFAULT_BASICS, name: 'test_pad', displayName: 'Test Pad', split: false, rows: 1, cols: 3 }) };

describe('starterKeymap', () => {
  it('fills keys with letters in order and round-trips through the keymap generator', () => {
    const keymap = starterKeymap(pad);
    expect(keymap.layers[0]?.bindings.map(formatBinding)).toEqual(['&kp Q', '&kp W', '&kp E']);
    expect(importKeymap(generateKeymap(keymap)).model).toEqual(keymap);
  });
});

describe('remapKeyPositions', () => {
  it('drops deleted keys, adds &trans for new ones and moves combos', () => {
    let keymap = starterKeymap(pad);
    keymap = { ...keymap, combos: [createCombo(keymap, [0, 1]), { ...createCombo(keymap, [0, 2]), name: 'combo_2' }] };
    const { model, notes } = remapKeyPositions(keymap, [0, 2, undefined]);
    expect(model.layers[0]?.bindings.map(formatBinding)).toEqual(['&kp Q', '&kp E', '&trans']);
    expect(model.combos.map((c) => [c.name, c.keyPositions])).toEqual([['combo_2', ['0', '1']]]);
    expect(notes).toEqual(['Removed combo combo_1: its keys were deleted.']);
  });

  it('keeps #define key positions and notes a combo that lost a key', () => {
    const keymap = { ...starterKeymap(pad), combos: [{ ...createCombo(starterKeymap(pad), [0, 1, 2]), keyPositions: ['0', '1', '2', 'EXTRA'] }] };
    const { model, notes } = remapKeyPositions(keymap, [0, 2]);
    expect(model.combos[0]?.keyPositions).toEqual(['0', '1', 'EXTRA']);
    expect(notes).toEqual(['Combo combo_1 lost a deleted key.']);
  });
});

describe('addKey / deleteKey', () => {
  it('adds a matrix key on the first free position of that half, next to its last key', () => {
    const split = gridHardware({ ...DEFAULT_BASICS, rows: 1, cols: 2 });
    const without = deleteKey(split, 2); // the right half's first key (row 0, column 0)
    const next = addKey(without, 'right');
    expect(next.keys.at(-1)).toMatchObject({ row: 0, col: 0, side: 'right', x: 600, y: 0 });
  });

  it('adds a direct input for a new direct-wired key', () => {
    const direct = gridHardware({ ...DEFAULT_BASICS, split: false, wiring: 'direct', rows: 1, cols: 2 });
    const next = addKey(direct);
    expect(next.wiring).toEqual({ kind: 'direct', pins: [null, null, null] });
    expect(next.keys.at(-1)).toMatchObject({ row: 0, col: 2, x: 200 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/hardware/keys.test.ts`
Expected: FAIL, with unresolved imports.

- [ ] **Step 3: Write `starter.ts`**

```ts
import { emptyKeymap, type KeymapModel } from '../keymap/model.ts';
import type { KeyboardHardware } from './types.ts';

/** Distinct keys, so every switch can be tested after the first flash. */
const STARTER_KEYS = [
  ...'QWERTYUIOPASDFGHJKLZXCVBNM'.split(''),
  'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9', 'N0',
  'SPACE', 'RET', 'BSPC', 'TAB', 'ESC', 'LSHFT', 'LCTRL', 'LALT', 'LGUI',
  'MINUS', 'EQUAL', 'LBKT', 'RBKT', 'SEMI', 'SQT', 'COMMA', 'DOT', 'FSLH', 'BSLH', 'GRAVE',
  'LEFT', 'DOWN', 'UP', 'RIGHT',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
];

/** One layer with a different key on each switch (in keymap order), then `&trans`. */
export function starterKeymap(hw: KeyboardHardware): KeymapModel {
  const bindings = hw.keys.map((_, i) => {
    const code = STARTER_KEYS[i];
    return code ? { behavior: 'kp', params: [code] } : { behavior: 'trans', params: [] };
  });
  return {
    ...emptyKeymap(),
    topLevel: [
      { kind: 'include', path: 'behaviors.dtsi', system: true },
      { kind: 'include', path: 'dt-bindings/zmk/keys.h', system: true },
    ],
    layers: [{ name: 'default_layer', displayName: 'Base', bindings, properties: [] }],
  };
}
```

If the round-trip assertion fails because the importer records the layer or includes differently, change `starterKeymap` to match what `importKeymap` produces. Check how `addLayer` in `src/core/keymap/edit.ts` builds a `Layer`. Don't loosen the test.

- [ ] **Step 4: Write `keys.ts`**

```ts
import type { Binding, Combo, KeymapModel } from '../keymap/model.ts';
import type { HardwareKey, KeyboardHardware, Side } from './types.ts';
import { directPins, halfSize } from './wiring.ts';

const trans = (): Binding => ({ behavior: 'trans', params: [] });

/**
 * Moves the keymap to a new key list. `newToOld[i]` is the old index of new
 * key `i`, or undefined for an added key (bound to `&trans`). Combos follow
 * their keys; a combo left with fewer than two keys is removed.
 */
export function remapKeyPositions(model: KeymapModel, newToOld: (number | undefined)[]): { model: KeymapModel; notes: string[] } {
  const oldToNew = new Map<number, number>();
  newToOld.forEach((old, index) => {
    if (old !== undefined) oldToNew.set(old, index);
  });
  const layers = model.layers.map((layer) => ({
    ...layer,
    bindings: newToOld.map((old) => (old === undefined ? trans() : (layer.bindings[old] ?? trans()))),
  }));
  const notes: string[] = [];
  const combos: Combo[] = [];
  for (const combo of model.combos) {
    const keyPositions = combo.keyPositions.flatMap((token) => {
      if (!/^\d+$/.test(token)) return [token];
      const moved = oldToNew.get(Number(token));
      return moved === undefined ? [] : [String(moved)];
    });
    if (keyPositions.length < 2) {
      notes.push(`Removed combo ${combo.name}: its keys were deleted.`);
      continue;
    }
    if (keyPositions.length < combo.keyPositions.length) notes.push(`Combo ${combo.name} lost a deleted key.`);
    combos.push({ ...combo, keyPositions });
  }
  return { model: { ...model, layers, combos }, notes };
}

function firstFree(rows: number, cols: number, used: Set<string>): { row: number; col: number } {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) if (!used.has(`${row},${col}`)) return { row, col };
  }
  return { row: 0, col: 0 };
}

/**
 * Adds a key right of the half's last key: on the first free matrix position,
 * or with a new direct input (when a mirrored right half shares the left's
 * inputs, the new input is shared too).
 */
export function addKey(hw: KeyboardHardware, side?: Side): KeyboardHardware {
  const onHalf = hw.keys.filter((k) => !hw.split || k.side === side);
  const last = onHalf.at(-1) ?? hw.keys.at(-1);
  const place = { x: last ? last.x + last.w : 0, y: last ? last.y : 0, w: 100, h: 100, r: 0, rx: 0, ry: 0 };
  const sideField = hw.split && side ? { side } : {};
  const wiring = hw.wiring;
  if (wiring.kind === 'direct') {
    const pins = directPins(wiring, side);
    const key: HardwareKey = { ...place, row: 0, col: pins.length, ...sideField };
    const next = side === 'right' && wiring.right ? { ...wiring, right: [...pins, null] } : { ...wiring, pins: [...wiring.pins, null] };
    return { ...hw, wiring: next, keys: [...hw.keys, key] };
  }
  const size = halfSize(hw, side);
  const spot = firstFree(size.rows, size.cols, new Set(onHalf.map((k) => `${k.row},${k.col}`)));
  return { ...hw, keys: [...hw.keys, { ...place, ...spot, ...sideField }] };
}

export function deleteKey(hw: KeyboardHardware, index: number): KeyboardHardware {
  return { ...hw, keys: hw.keys.filter((_, i) => i !== index) };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/core/hardware/keys.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/core/hardware/starter.ts src/core/hardware/keys.ts src/core/hardware/keys.test.ts
git commit -m "Add starter keymaps and keep keymaps and combos in step with hardware edits"
```

---

### Task 7: Wire hardware into the config (generate, import, hand-edit detection)

**Files:**
- Create: `src/core/hardware/config.ts`
- Modify: `src/core/config.ts`, `src/core/hardware/generate.ts` (add `handEditedShieldFiles`)
- Test: `src/core/hardware/config.test.ts`

**Interfaces:**
- Consumes: everything above; `parseKconfig` (`src/core/files/kconfig.ts`); `BuildTarget`.
- Produces:
  - `ZmkConfig.hardware?: KeyboardHardware`;
  - `customLayout(config): PhysicalLayout | undefined` (in `src/core/config.ts`);
  - `handEditedShieldFiles(files, keyboard): string[]` (in `generate.ts`);
  - `shieldNames(hw)`, `hardwareBuildTargets(hw): BuildTarget[]`;
  - `newHardwareConfig(hw, zmkVersion): ZmkConfig`;
  - `applyHardware(config, hw, newToOld): { config; notes }`.

- [ ] **Step 1: Write the failing test** — `src/core/hardware/config.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { configPaths, generateConfig, importConfig } from '../config.ts';
import { formatBinding } from '../keymap/bindings.ts';
import { applyHardware, newHardwareConfig } from './config.ts';
import { definitionPath } from './definition.ts';
import { handEditedShieldFiles } from './generate.ts';
import { testSplit } from './testFixtures.ts';

const config = newHardwareConfig(testSplit, 'v0.3');

describe('configs with a designed keyboard', () => {
  it('builds each half on the chosen controller', () => {
    expect(config.keyboard).toBe('test_split');
    expect(config.build.include).toEqual([
      { board: 'nice_nano_v2', shield: 'test_split_left' },
      { board: 'nice_nano_v2', shield: 'test_split_right' },
    ]);
    expect(config.keymap.layers[0]?.bindings).toHaveLength(4);
  });

  it('writes the shield files instead of info.json', () => {
    const files = generateConfig(config);
    expect(files[definitionPath('test_split')]).toBeDefined();
    expect(files['config/boards/shields/test_split/test_split_right.overlay']).toContain('col-offset = <2>;');
    expect(files[configPaths('test_split').info]).toBeUndefined();
  });

  it('round-trips and is deterministic', () => {
    const generated = generateConfig(config);
    const again = importConfig(generated);
    expect(again.warnings).toEqual([]);
    expect(again.config).toEqual(config);
    expect(generateConfig(again.config)).toEqual(generated);
  });

  it('warns about shield files changed outside the editor', () => {
    const files = generateConfig(config);
    const overlay = 'config/boards/shields/test_split/test_split_left.overlay';
    files[overlay] = `${files[overlay]}/* tweak */\n`;
    expect(handEditedShieldFiles(files, 'test_split')).toEqual([overlay]);
    expect(importConfig(files).warnings).toEqual([`${overlay} was changed outside the editor; committing replaces it with the editor’s version.`]);
  });

  it('ignores Windows line endings when comparing', () => {
    const files = generateConfig(config);
    const kconfig = 'config/boards/shields/test_split/Kconfig.shield';
    files[kconfig] = (files[kconfig] ?? '').replace(/\n/g, '\r\n');
    expect(handEditedShieldFiles(files, 'test_split')).toEqual([]);
  });

  it('keeps going when the definition is broken', () => {
    const files = { ...generateConfig(config), [definitionPath('test_split')]: '{' };
    const { config: imported, warnings } = importConfig(files);
    expect(imported.hardware).toBeUndefined();
    expect(warnings[0]).toMatch(/^Ignored config\/boards\/shields\/test_split\/test_split\.editor\.json: /);
  });

  it('applies a hardware edit: remaps the keymap and moves the build to the new controller', () => {
    const edited = { ...testSplit, controller: 'puchi_ble_v1', keys: testSplit.keys.slice(1) };
    const { config: next, notes } = applyHardware(config, edited, [1, 2, 3]);
    expect(next.keymap.layers[0]?.bindings.map(formatBinding)).toEqual(['&kp W', '&kp E', '&kp R']);
    expect(next.build.include.map((t) => t.board)).toEqual(['puchi_ble_v1', 'puchi_ble_v1']);
    expect(next.hardware).toBe(edited);
    expect(notes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/hardware/config.test.ts`
Expected: FAIL, with unresolved `./config.ts` and `handEditedShieldFiles`.

- [ ] **Step 3: Write `src/core/hardware/config.ts`**

```ts
import type { ZmkConfig } from '../config.ts';
import type { BuildTarget } from '../files/build.ts';
import { parseKconfig } from '../files/kconfig.ts';
import { remapKeyPositions } from './keys.ts';
import { starterKeymap } from './starter.ts';
import type { KeyboardHardware } from './types.ts';

export function shieldNames(hw: KeyboardHardware): string[] {
  return hw.split ? [`${hw.name}_left`, `${hw.name}_right`] : [hw.name];
}

export function hardwareBuildTargets(hw: KeyboardHardware): BuildTarget[] {
  return shieldNames(hw).map((shield) => ({ board: hw.controller, shield }));
}

/** A fresh config for a keyboard designed in the editor. */
export function newHardwareConfig(hw: KeyboardHardware, zmkVersion: string): ZmkConfig {
  return {
    keyboard: hw.name,
    keymap: starterKeymap(hw),
    kconfig: parseKconfig(''),
    west: { zmkVersion, modules: [], selfPath: 'config' },
    build: { include: hardwareBuildTargets(hw) },
    hardware: hw,
  };
}

/**
 * Applies edited hardware. `newToOld[i]` is the old index of key `i`
 * (undefined for added keys); the keymap and combos follow. The keyboard's
 * build targets move to the new controller, keeping their extra shields.
 */
export function applyHardware(config: ZmkConfig, hw: KeyboardHardware, newToOld: (number | undefined)[]): { config: ZmkConfig; notes: string[] } {
  const { model, notes } = remapKeyPositions(config.keymap, newToOld);
  const shields = new Set(shieldNames(hw));
  const include = config.build.include.map((t) => (shields.has(t.shield?.split(' ')[0] ?? '') ? { ...t, board: hw.controller } : t));
  return { config: { ...config, keymap: model, hardware: hw, build: { include } }, notes };
}
```

- [ ] **Step 4: Add `handEditedShieldFiles` to `src/core/hardware/generate.ts`**

```ts
import { definitionPath, parseHardware, serializeHardware, shieldDir } from './definition.ts';

/**
 * Shield files in a repo that differ from what the repo's own definition
 * generates, i.e. edited by hand. Missing files don't count.
 */
export function handEditedShieldFiles(files: Record<string, string>, keyboard: string): string[] {
  const text = files[definitionPath(keyboard)];
  if (text === undefined) return [];
  let hw: KeyboardHardware;
  try {
    hw = parseHardware(text);
  } catch {
    return [];
  }
  return Object.entries(generateShield(hw))
    .filter(([path, generated]) => {
      const existing = files[path];
      return existing !== undefined && existing.replace(/\r\n/g, '\n') !== generated;
    })
    .map(([path]) => path);
}
```

- [ ] **Step 5: Change `src/core/config.ts`**

Add these imports:

```ts
import { definitionPath, parseHardware } from './hardware/definition.ts';
import { generateShield, handEditedShieldFiles } from './hardware/generate.ts';
import { hardwareLayout, type KeyboardHardware } from './hardware/types.ts';
```

Add this field to `ZmkConfig`, after `layout`:

```ts
  /** A keyboard designed in the editor; its shield files are generated from it and it supplies the layout. */
  hardware?: KeyboardHardware;
```

Add this below `configPaths`:

```ts
/** The layout the config draws for itself: a designed keyboard's, else the designer layout (info.json). */
export function customLayout(config: Pick<ZmkConfig, 'hardware' | 'layout'>): PhysicalLayout | undefined {
  return config.hardware ? hardwareLayout(config.hardware) : config.layout;
}
```

In `importConfig`:
1. Compute `const keyCount = keymap.layers[0]?.bindings.length ?? 0;` right after the keymap is imported, and delete the later declaration inside the `info.json` branch.
2. Before the `info.json` block, add:

```ts
  const definitionText = files[definitionPath(name)];
  if (definitionText !== undefined) {
    try {
      const hardware = parseHardware(definitionText);
      config.hardware = hardware;
      if (hardware.keys.length !== keyCount) warnings.push(`The keyboard has ${hardware.keys.length} keys but the keymap has ${keyCount}.`);
      for (const path of handEditedShieldFiles(files, name)) {
        warnings.push(`${path} was changed outside the editor; committing replaces it with the editor’s version.`);
      }
    } catch (error) {
      warnings.push(`Ignored ${definitionPath(name)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
```

3. Change `const infoText = files[paths.info];` to `const infoText = config.hardware ? undefined : files[paths.info];`.

In `generateConfig`:

```ts
  [paths.keymap]: generateKeymap(config.keymap, textLayoutFor(config.keyboard, keyCount, customLayout(config))),
```

Replace `if (config.layout) files[paths.info] = generateInfoJson(config.layout);` with:

```ts
  if (config.hardware) Object.assign(files, generateShield(config.hardware));
  else if (config.layout) files[paths.info] = generateInfoJson(config.layout);
```

- [ ] **Step 6: Run the new tests and the whole suite**

Run: `npx vitest run src/core test/lily58.test.ts`
Expected: PASS. The Lily58 round-trip and snapshots are unchanged, because it has no `hardware`.

- [ ] **Step 7: Commit**

```bash
git add src/core/config.ts src/core/hardware/config.ts src/core/hardware/generate.ts src/core/hardware/config.test.ts
git commit -m "Keep custom keyboards in the config and write their shields with it"
```

---

### Task 8: Fixtures built with real ZMK in CI

**Files:**
- Create: `test/customKeyboards.test.ts`; generated snapshots under `test/generated/editor_split/`, `test/generated/editor_numpad/`, `test/generated/editor_duo/`
- Modify: `.github/workflows/firmware.yml`

**Interfaces:**
- Consumes: `gridHardware`, `DEFAULT_BASICS`, `validateHardware`, `newHardwareConfig`, `generateConfig`.
- Produces: generated `zmk-config` directories that CI builds.

- [ ] **Step 1: Write the fixture test** — `test/customKeyboards.test.ts`

```ts
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateConfig, importConfig } from '../src/core/config.ts';
import { newHardwareConfig } from '../src/core/hardware/config.ts';
import { DEFAULT_BASICS, gridHardware } from '../src/core/hardware/grid.ts';
import type { KeyboardHardware } from '../src/core/hardware/types.ts';
import { validateHardware } from '../src/core/hardware/validate.ts';

/** A 3×6+3 split (Corne-like), COL2ROW, right half mirrored; the Corne's pins. */
const split: KeyboardHardware = (() => {
  const hw = gridHardware({ ...DEFAULT_BASICS, name: 'editor_split', displayName: 'Editor Split', rows: 4, cols: 6 });
  return {
    ...hw,
    wiring: { kind: 'matrix', diodeDirection: 'col2row', rows: [4, 5, 6, 7], cols: [21, 20, 19, 18, 15, 14] },
    // Row 3 keeps the three inner thumb keys per half.
    keys: hw.keys.filter((k) => k.row !== 3 || (k.side === 'left' ? k.col >= 3 : k.col <= 2)),
  };
})();

/** A 5×4 numpad, ROW2COL, one piece. */
const numpad: KeyboardHardware = {
  ...gridHardware({ ...DEFAULT_BASICS, name: 'editor_numpad', displayName: 'Editor Numpad', controller: 'puchi_ble_v1', split: false, rows: 5, cols: 4, diodeDirection: 'row2col' }),
  wiring: { kind: 'matrix', diodeDirection: 'row2col', rows: [2, 3, 4, 5, 6], cols: [7, 8, 9, 10] },
};

/** A 2×3 direct-wired split whose right half has its own pins. */
const duo: KeyboardHardware = {
  ...gridHardware({ ...DEFAULT_BASICS, name: 'editor_duo', displayName: 'Editor Duo', controller: 'bluemicro840_v1', wiring: 'direct', rows: 2, cols: 3 }),
  wiring: { kind: 'direct', pins: [2, 3, 4, 5, 6, 7], right: [21, 20, 19, 18, 15, 14] },
};

// Built with ZMK in CI (.github/workflows/firmware.yml). Update with `npx vitest run -u`.
describe.each([split, numpad, duo])('designed keyboard $name', (hw) => {
  const config = newHardwareConfig(hw, 'v0.3');

  it('is valid and round-trips', () => {
    expect(validateHardware(hw).filter((i) => i.level === 'error')).toEqual([]);
    expect(importConfig(generateConfig(config)).config).toEqual(config);
  });

  it.each(Object.entries(generateConfig(config)))('matches the committed %s', async (path, content) => {
    await expect(content).toMatchFileSnapshot(join('generated', hw.name, path));
  });
});
```

- [ ] **Step 2: Generate the snapshots and look at them**

Run: `npx vitest run test/customKeyboards.test.ts -u`
Expected: PASS, and files are written under `test/generated/editor_split/`, `editor_numpad/` and `editor_duo/`. Open `editor_split/config/boards/shields/editor_split/editor_split.dtsi` and check:
- `map` has three rows of 12 and a thumb row of 6;
- the right overlay has `col-offset = <6>;`;
- the right half's `col-gpios` are `14 15 18 19 20 21`, the reverse of the left.

Those are the Corne's own values.

- [ ] **Step 3: Build every generated config in `.github/workflows/firmware.yml`**

Change the header comment to "Builds every generated config in test/generated/…". Remove the `env: CONFIG_DIR` block, and replace the `matrix` step and the build steps' `CONFIG_DIR` uses:

```yaml
      - id: matrix
        run: |
          matrix=$(for dir in test/generated/*/; do
            yq -oj -I0 ".include[] | .dir = \"${dir%/}\"" "$dir/build.yaml"
          done | jq -sc '{include: .}')
          echo "build_matrix=$matrix" >> "$GITHUB_OUTPUT"
```

```yaml
    name: Build ${{ matrix.dir }} ${{ matrix.shield }}
```

```yaml
      - name: Copy the generated config into a fresh west workspace
        run: |
          mkdir -p /tmp/ws
          cp -R "${{ matrix.dir }}/config" /tmp/ws/config
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/customKeyboards.test.ts test/generated .github/workflows/firmware.yml
git commit -m "Build generated custom keyboards with real ZMK in CI"
```

The firmware build runs when the branch is pushed (Task 13). A failure there means the generated files are wrong, so fix the generator, not the workflow.

---

### Task 9: Repo loading, file import, the Build tab and the header know about designed keyboards

**Files:**
- Modify: `src/ui/components/ConnectSection.tsx:17-19`, `src/ui/components/Toolbar.tsx:29-49,65`, `src/ui/components/BuildView.tsx`, `src/ui/App.tsx:43,102`
- Test: `src/ui/Build.test.tsx`, `src/ui/Milestone5.test.tsx`

**Interfaces:**
- Consumes: `customLayout`, `handEditedShieldFiles`, `definitionPath`, `newHardwareConfig`.
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/Build.test.tsx`, and add these imports: `newHardwareConfig` from `../core/hardware/config.ts`, and `testPad` from `../core/hardware/testFixtures.ts`.

```tsx
describe('Build tab with a designed keyboard', () => {
  it('asks before replacing shield files edited by hand', async () => {
    const config = newHardwareConfig(testPad, 'v0.3');
    const files = generateConfig(config);
    const overlay = 'config/boards/shields/test_pad/test_pad.overlay';
    files[overlay] = `${files[overlay]}/* my tweak */\n`;
    fake = new FakeGitHub(files);
    vi.stubGlobal('fetch', fake.fetch);
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config }));

    const user = userEvent.setup();
    render(<App />);
    await connect(user);
    expect(await screen.findByText(/test_pad\.overlay was changed outside the editor/)).toBeTruthy();
    const commit = screen.getByRole('button', { name: 'Commit & build' });
    expect(commit).toHaveProperty('disabled', true);
    await user.click(screen.getByLabelText('Replace my changes to the shield files'));
    expect(commit).toHaveProperty('disabled', false);
  });
});
```

Append to the `describe` in `src/ui/Milestone5.test.tsx` that has "opens a keymap together with its west.yml":

```tsx
  it('opens a designed keyboard with its definition file', async () => {
    const user = userEvent.setup();
    render(<App />);
    const files = generateConfig(newHardwareConfig(testPad, 'v0.3'));
    const keymap = new File([files['config/test_pad.keymap'] ?? ''], 'test_pad.keymap');
    const definition = new File([files['config/boards/shields/test_pad/test_pad.editor.json'] ?? ''], 'test_pad.editor.json');
    await user.upload(screen.getByTestId('config-files'), [keymap, definition]);
    expect(await screen.findByRole('button', { name: 'Test Pad ▾' })).toBeTruthy();
  });
```

Add the matching imports to that file: `generateConfig`, `newHardwareConfig` and `testPad` (from `../core/hardware/testFixtures.ts`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/Build.test.tsx src/ui/Milestone5.test.tsx`
Expected: FAIL. The warning text isn't shown and the badge doesn't read "Test Pad ▾".

- [ ] **Step 3: Implement**

`ConnectSection.tsx`, to load the shield folder too:

```ts
const isConfigFile = (path: string) =>
  /^config\/[^/]+\.(keymap|conf)$/.test(path) ||
  path.startsWith('config/boards/shields/') ||
  ['config/west.yml', 'config/info.json', 'build.yaml', '.github/workflows/build.yml'].includes(path);
```

`Toolbar.tsx`:
1. In `filesToConfig`, before the `info.json` branch, add `else if (file.name.endsWith('.editor.json')) repo[definitionPath(keyboard)] = text;`.
2. Add `.editor.json` to the error message: `'Pick a .keymap file (and optionally its .conf, west.yml, build.yaml and .editor.json).'`
3. The hidden file input already accepts `.json` (`accept=".keymap,.conf,.yml,.yaml,.json"`), so `.editor.json` files can be picked.
4. In `downloadKeymap`, use `customLayout(config)` instead of `config.layout`.

`App.tsx`:

```tsx
  const layout = physicalLayoutFor(config.keyboard, keyCount, layouts[config.keyboard], customLayout(config));
```

and in the badge:

```tsx
            {config.hardware?.displayName ?? findKeyboard(config.keyboard)?.name ?? config.keyboard} ▾
```

`BuildView.tsx`, below `changes`:

```tsx
  const [replaceHandEdits, setReplaceHandEdits] = useState(false);
  const handEdited = useMemo(
    () => (connection ? handEditedShieldFiles(connection.files, config.keyboard).filter((path) => changes.some(([p]) => p === path)) : []),
    [connection, config.keyboard, changes],
  );
```

Inside the Changes section, above the commit row:

```tsx
          {handEdited.length > 0 && (
            <div className="field">
              <p className="field-error">
                {handEdited.join(', ')} {handEdited.length === 1 ? 'was' : 'were'} changed outside the editor. Committing replaces{' '}
                {handEdited.length === 1 ? 'it' : 'them'} with the editor’s version.
              </p>
              <label className="field checkbox">
                <input type="checkbox" checked={replaceHandEdits} onChange={(e) => setReplaceHandEdits(e.target.checked)} />
                <span>Replace my changes to the shield files</span>
              </label>
            </div>
          )}
```

Add `|| (handEdited.length > 0 && !replaceHandEdits)` to the Commit & build button's `disabled`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui
git commit -m "Load, show and commit designed keyboards; guard hand-edited shield files"
```

---

### Task 10: Move the designer canvas into its own file

This is a refactor only. The wizard's Layout step (Task 11) reuses the canvas and fields. Two optional props are added to the canvas; `LayoutDesigner` doesn't pass them, so its behavior is unchanged.

**Files:**
- Create: `src/ui/components/DesignerCanvas.tsx`
- Modify: `src/ui/components/LayoutDesigner.tsx`, `src/ui/styles.css`
- Test: the existing `src/ui/Designer.test.tsx` (unchanged, must still pass)

**Interfaces:**
- Produces, from `DesignerCanvas.tsx`:
  - `DesignerCanvas({ layout, labels, selected, onSelect, onChange, flagged? }: { …; flagged?: Set<number> })`;
  - `LiveNumberField`, `UnitField`, `RotationField` (the same props as today).

- [ ] **Step 1: Move the code.** Cut `LiveNumberField`, `UnitField`, `RotationField` and `DesignerCanvas`, plus the `SNAP`, `MARGIN` and `snap` constants they use, from `LayoutDesigner.tsx` into `DesignerCanvas.tsx`. Export the four components. Import them in `LayoutDesigner.tsx`. Move the React imports each file needs.

- [ ] **Step 2: Add the `flagged` prop** to `DesignerCanvas`:
  - in the props type: `flagged?: Set<number>;`;
  - in the key's class name: `` className={`designer-key${selected === index ? ' selected' : ''}${flagged?.has(index) ? ' flagged' : ''}`} ``.

Add CSS after `.designer-key.selected rect, …` in `styles.css`:

```css
.designer-key.flagged rect {
  stroke: var(--danger);
  stroke-width: 6;
}
```

- [ ] **Step 3: Run the designer tests**

Run: `npx vitest run src/ui/Designer.test.tsx && npm run lint`
Expected: PASS, with no lint errors (`react-refresh/only-export-components` is fine, since the file exports only components).

- [ ] **Step 4: Commit**

```bash
git add src/ui/components/DesignerCanvas.tsx src/ui/components/LayoutDesigner.tsx src/ui/styles.css
git commit -m "Move the layout canvas into its own file so the keyboard wizard can reuse it"
```

---

### Task 11: The "Design your own keyboard" wizard

**Files:**
- Create in `src/ui/components/`: `HardwareWizard.tsx`, `HardwareBasicsStep.tsx`, `HardwareWiringStep.tsx`, `ProMicroPinout.tsx`, `HardwareLayoutStep.tsx`, `HardwareReviewStep.tsx`, `HardwareIssueList.tsx`
- Modify: `src/ui/App.tsx`, `src/ui/components/KeyboardView.tsx`, `src/ui/styles.css`
- Test: `src/ui/NewKeyboard.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–7; `DesignerCanvas`, `LiveNumberField`, `UnitField`, `RotationField` (Task 10).
- Produces:
  - `HardwareWizard({ config, dispatch, mode: 'create' | 'edit', onDone, onCancel })`;
  - `HardwareDraft { hw: KeyboardHardware; origins: (number | undefined)[] }`;
  - new `KeyboardView` props `onNewKeyboard?: () => void` and `onEditHardware?: () => void`;
  - new `View`s `'newKeyboard' | 'editHardware'`.

- [ ] **Step 1: Write the failing UI test** — `src/ui/NewKeyboard.test.tsx`

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const stored = () => JSON.parse(localStorage.getItem('zmk-editor.config.v1') ?? '{}').config;
const canvasKey = (index: number) =>
  within(screen.getByRole('group', { name: 'Layout canvas' })).getByRole('button', { name: new RegExp(`^Key ${index}:`) });

async function openWizard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Lily58 ▾' }));
  await user.click(screen.getByRole('button', { name: 'Design your own keyboard' }));
}

async function type(user: ReturnType<typeof userEvent.setup>, label: string, text: string) {
  const field = screen.getByLabelText(label);
  await user.clear(field);
  await user.type(field, text);
}

describe('Design your own keyboard', () => {
  it('creates a direct-wired macropad from scratch', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<App />);
    await openWizard(user);

    await type(user, 'Keyboard name', 'Test Pad');
    expect((screen.getByLabelText('Id') as HTMLInputElement).value).toBe('test_pad');
    await user.click(screen.getByLabelText('Split keyboard (two halves)'));
    await user.click(screen.getByLabelText('Direct (one pin per key)'));
    await type(user, 'Rows', '1');
    await type(user, 'Columns', '3');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Wiring: one pin with its field, one on the pinout, one more with its field.
    await user.selectOptions(screen.getByLabelText('Input 0'), '4');
    await user.click(screen.getByLabelText('Input 1'));
    await user.click(screen.getByRole('button', { name: 'D5' }));
    await user.selectOptions(screen.getByLabelText('Input 2'), '6');
    expect(screen.getByRole('button', { name: 'D5: Input 1' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Layout: drop the last key.
    await user.click(canvasKey(2));
    await user.click(screen.getByRole('button', { name: 'Delete key' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Review: an unused input is only a warning; the files are listed.
    expect(screen.getByText('Input 2 has no key.')).toBeTruthy();
    expect(screen.getByText('config/boards/shields/test_pad/test_pad.overlay')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Create keyboard' }));

    expect(screen.getByRole('button', { name: 'Test Pad ▾' })).toBeTruthy();
    const config = stored();
    expect(config.hardware.wiring).toEqual({ kind: 'direct', pins: [4, 5, 6] });
    expect(config.build.include).toEqual([{ board: 'nice_nano_v2', shield: 'test_pad' }]);
    expect(config.keymap.layers[0].bindings).toHaveLength(2);
  });

  it('won’t create a keyboard with a pin used twice', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openWizard(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.selectOptions(screen.getByLabelText('Left row 0'), '4');
    await user.selectOptions(screen.getByLabelText('Left row 1'), '4');
    expect(screen.getByText('D4 is used for both Row 0 and Row 1 on the left half.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Create keyboard' })).toHaveProperty('disabled', true);
  });

  it('stops at Basics when the matrix needs more pins than the controller has', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openWizard(user);
    await type(user, 'Columns', '16');
    expect(screen.getByText('A 3 × 16 matrix needs 19 pins per half, but the controller has 18.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/NewKeyboard.test.tsx`
Expected: FAIL: `Unable to find role="button" and name "Design your own keyboard"`.

- [ ] **Step 3: Write `HardwareIssueList.tsx`**

```tsx
import type { HardwareIssue } from '../../core/hardware/validate.ts';

/** Problems with the keyboard; errors block creating it. */
export function HardwareIssueList({ issues }: { issues: HardwareIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="notes" aria-label="Problems">
      {issues.map((issue) => (
        <li key={issue.message} className={issue.level === 'error' ? 'field-error' : 'muted'}>
          {issue.message}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Write `HardwareBasicsStep.tsx`**

```tsx
import { useState } from 'react';
import { HARDWARE_CONTROLLERS } from '../../core/hardware/controllers.ts';
import { hardwareName, type HardwareBasics } from '../../core/hardware/grid.ts';
import type { HardwareIssue } from '../../core/hardware/validate.ts';
import { HardwareIssueList } from './HardwareIssueList.tsx';

interface Props {
  basics: HardwareBasics;
  /** Editing an existing keyboard: the id, split and wiring kind are fixed. */
  editing: boolean;
  issues: HardwareIssue[];
  onChange: (basics: HardwareBasics) => void;
}

export function HardwareBasicsStep({ basics, editing, issues, onChange }: Props) {
  const set = (patch: Partial<HardwareBasics>) => onChange({ ...basics, ...patch });
  // The id follows the name until it's edited by hand.
  const [idEdited, setIdEdited] = useState(editing);
  const sizeFixed = editing && basics.wiring === 'direct';
  return (
    <div className="stack">
      <div className="field">
        <label className="field-label" htmlFor="hw-name">Keyboard name</label>
        <input
          id="hw-name"
          className="input"
          aria-describedby="hw-name-help"
          value={basics.displayName}
          onChange={(e) => set({ displayName: e.target.value, ...(idEdited ? {} : { name: hardwareName(e.target.value) }) })}
        />
        <p id="hw-name-help" className="muted small">Shown in the editor and as the Bluetooth name (at most 16 characters).</p>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="hw-id">Id</label>
        <input
          id="hw-id"
          className="input mono"
          aria-describedby="hw-id-help"
          value={basics.name}
          disabled={editing}
          onChange={(e) => {
            setIdEdited(true);
            set({ name: e.target.value });
          }}
        />
        <p id="hw-id-help" className="muted small">
          Names the files: config/boards/shields/{basics.name}/ and config/{basics.name}.keymap.
          {editing && ' It can’t change once the keyboard exists.'}
        </p>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="hw-controller">Controller</label>
        <select id="hw-controller" className="input" value={basics.controller} onChange={(e) => set({ controller: e.target.value })}>
          {HARDWARE_CONTROLLERS.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <label className="field checkbox">
        <input type="checkbox" checked={basics.split} disabled={editing} onChange={(e) => set({ split: e.target.checked })} />
        <span>Split keyboard (two halves)</span>
      </label>
      <fieldset className="fieldset">
        <legend>Wiring</legend>
        <label className="field checkbox">
          <input type="radio" name="hw-wiring" checked={basics.wiring === 'matrix'} disabled={editing} onChange={() => set({ wiring: 'matrix' })} />
          <span>Matrix with diodes (rows × columns)</span>
        </label>
        <label className="field checkbox">
          <input type="radio" name="hw-wiring" checked={basics.wiring === 'direct'} disabled={editing} onChange={() => set({ wiring: 'direct' })} />
          <span>Direct (one pin per key)</span>
        </label>
      </fieldset>
      <div className="field-grid">
        <div className="field">
          <label className="field-label" htmlFor="hw-rows">Rows</label>
          <input id="hw-rows" className="input" type="number" min={1} max={18} value={basics.rows} disabled={sizeFixed} onChange={(e) => set({ rows: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="hw-cols">Columns</label>
          <input id="hw-cols" className="input" type="number" min={1} max={18} value={basics.cols} disabled={sizeFixed} aria-describedby="hw-size-help" onChange={(e) => set({ cols: Number(e.target.value) })} />
        </div>
      </div>
      <p id="hw-size-help" className="muted small">
        {basics.split ? 'Per half. ' : ''}You can move, add and remove keys on the Layout step.
      </p>
      {basics.wiring === 'matrix' && (
        <div className="field">
          <label className="field-label" htmlFor="hw-diodes">Diode direction</label>
          <select id="hw-diodes" className="input" aria-describedby="hw-diodes-help" value={basics.diodeDirection} onChange={(e) => set({ diodeDirection: e.target.value === 'row2col' ? 'row2col' : 'col2row' })}>
            <option value="col2row">COL2ROW</option>
            <option value="row2col">ROW2COL</option>
          </select>
          <p id="hw-diodes-help" className="muted small">
            COL2ROW: each diode’s marked end (the black band) faces the row wire. ROW2COL: it faces the column wire. Most
            keyboards use COL2ROW.
          </p>
        </div>
      )}
      <HardwareIssueList issues={issues} />
    </div>
  );
}
```

- [ ] **Step 5: Write `ProMicroPinout.tsx`**

```tsx
import { isNiceNano, PRO_MICRO_HEADER, type HeaderPad } from '../../core/hardware/controllers.ts';
import type { KeyboardHardware, Side } from '../../core/hardware/types.ts';
import { pinUses } from '../../core/hardware/wiring.ts';

interface Props {
  hw: KeyboardHardware;
  side?: Side;
  onPick: (pin: number) => void;
}

/** The Pro Micro seen from above; each pin shows what it's used for. Clicking one fills the selected field. */
export function ProMicroPinout({ hw, side, onPick }: Props) {
  const uses = pinUses(hw, side);
  const nice = isNiceNano(hw.controller);
  const column = (pads: HeaderPad[], edge: 'left' | 'right') => (
    <ul className={`pinout-column ${edge}`}>
      {pads.map((pad, i) => {
        const pin = pad.pin;
        if (pin === null) {
          return (
            <li key={i}>
              <span className="pinout-pad power">{pad.label}</span>
            </li>
          );
        }
        const use = uses.get(pin)?.join(', ');
        return (
          <li key={i}>
            <button type="button" className={`pinout-pad${use ? ' used' : ''}`} aria-label={use ? `${pad.label}: ${use}` : pad.label} onClick={() => onPick(pin)}>
              <span className="pinout-label">{pad.label}</span>
              {nice && <span className="pinout-sub">{pad.niceNano}</span>}
              {use && <span className="pinout-use">{use}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
  return (
    <figure className="pinout" aria-label="Pro Micro pinout">
      <figcaption className="muted small">
        Pins seen from above, USB at the top{side ? ` (${side} half)` : ''}. Select a field, then click a pin.
      </figcaption>
      <div className="pinout-board">
        {column(PRO_MICRO_HEADER.left, 'left')}
        <div className="pinout-usb" aria-hidden="true">USB</div>
        {column(PRO_MICRO_HEADER.right, 'right')}
      </div>
    </figure>
  );
}
```

- [ ] **Step 6: Write `HardwareWiringStep.tsx`**

```tsx
import { useState } from 'react';
import { PRO_MICRO_PINS, pinLabel } from '../../core/hardware/controllers.ts';
import type { KeyboardHardware, Pin, Side } from '../../core/hardware/types.ts';
import type { HardwareIssue } from '../../core/hardware/validate.ts';
import {
  directInputUsed,
  directPins,
  matrixPins,
  pinUses,
  removeDirectPin,
  setPin,
  setRightWiredDifferently,
  type PinList,
} from '../../core/hardware/wiring.ts';
import { HardwareIssueList } from './HardwareIssueList.tsx';
import { ProMicroPinout } from './ProMicroPinout.tsx';

interface Slot {
  side?: Side;
  list: PinList;
  index: number;
}

interface Props {
  hw: KeyboardHardware;
  issues: HardwareIssue[];
  onChange: (hw: KeyboardHardware) => void;
}

export function HardwareWiringStep({ hw, issues, onChange }: Props) {
  const [active, setActive] = useState<Slot | null>(null);
  const differently = hw.wiring.right !== undefined;
  const shown: (Side | undefined)[] = hw.split ? (differently ? ['left', 'right'] : ['left']) : [undefined];
  return (
    <div className="wiring-step">
      <div className="stack">
        <p className="muted small">
          {hw.wiring.kind === 'direct'
            ? 'Each key connects its pin to ground; no diodes are needed. Pick the pin each key is soldered to.'
            : 'Pick the controller pin each row and column wire is soldered to.'}
        </p>
        {hw.split && (
          <label className="field checkbox">
            <input type="checkbox" checked={differently} onChange={(e) => onChange(setRightWiredDifferently(hw, e.target.checked))} />
            <span>The right half is wired differently</span>
          </label>
        )}
        {hw.split && !differently && (
          <p className="muted small">
            The right half is wired as a mirror image of the left, like a reversible PCB: the same pins, with the outer
            columns sharing a pin.
          </p>
        )}
        {shown.map((side) => (
          <PinTables key={side ?? 'one'} hw={hw} side={side} onChange={onChange} onFocusSlot={setActive} />
        ))}
        <HardwareIssueList issues={issues} />
      </div>
      <ProMicroPinout hw={hw} side={active?.side} onPick={(pin) => active && onChange(setPin(hw, active.side, active.list, active.index, pin))} />
    </div>
  );
}

function PinTables({ hw, side, onChange, onFocusSlot }: { hw: KeyboardHardware; side?: Side; onChange: (hw: KeyboardHardware) => void; onFocusSlot: (slot: Slot) => void }) {
  const prefix = side === 'left' ? 'Left ' : side === 'right' ? 'Right ' : '';
  const lists: { list: PinList; title: string; item: string; pins: Pin[] }[] =
    hw.wiring.kind === 'direct'
      ? [{ list: 'pins', title: 'Inputs (one per key)', item: 'Input', pins: directPins(hw.wiring, side) }]
      : [
          { list: 'rows', title: 'Rows', item: 'Row', pins: matrixPins(hw.wiring, side).rows },
          { list: 'cols', title: 'Columns', item: 'Column', pins: matrixPins(hw.wiring, side).cols },
        ];
  const uses = pinUses(hw, side);
  return (
    <>
      {lists.map(({ list, title, item, pins }) => (
        <fieldset key={list} className="fieldset">
          <legend>{side ? `${prefix}half · ${title}` : title}</legend>
          <div className="pin-grid">
            {pins.map((pin, index) => {
              const id = `pin-${side ?? 'one'}-${list}-${index}`;
              const name = `${item} ${index}`;
              const label = prefix ? `${prefix}${name.toLowerCase()}` : name;
              return (
                <div key={index} className="field">
                  <label className="field-label" htmlFor={id}>{label}</label>
                  <select
                    id={id}
                    className="input"
                    value={pin ?? ''}
                    onFocus={() => onFocusSlot({ side, list, index })}
                    onChange={(e) => onChange(setPin(hw, side, list, index, e.target.value === '' ? null : Number(e.target.value)))}
                  >
                    <option value="">No pin</option>
                    {PRO_MICRO_PINS.map((p) => {
                      const other = (uses.get(p) ?? []).filter((use) => use !== name);
                      return (
                        <option key={p} value={p}>
                          {pinLabel(p)}
                          {other.length > 0 ? ` (${other.join(', ')})` : ''}
                        </option>
                      );
                    })}
                  </select>
                  {list === 'pins' && !directInputUsed(hw, side, index) && (
                    <button type="button" className="link-button" onClick={() => onChange(removeDirectPin(hw, side, index))}>
                      Remove unused input
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </>
  );
}
```

For a unibody keyboard the labels are "Row 0", "Column 2" and "Input 1". For a split they are "Left row 0" and "Right column 2". The tests rely on these names.

- [ ] **Step 7: Write `HardwareLayoutStep.tsx`**

```tsx
import { useState } from 'react';
import { addKey, deleteKey } from '../../core/hardware/keys.ts';
import { hardwareLayout, type HardwareKey, type KeyboardHardware, type Side } from '../../core/hardware/types.ts';
import type { HardwareIssue } from '../../core/hardware/validate.ts';
import { DesignerCanvas, LiveNumberField, RotationField, UnitField } from './DesignerCanvas.tsx';
import type { HardwareDraft } from './HardwareWizard.tsx';
import { HardwareIssueList } from './HardwareIssueList.tsx';

interface Props {
  draft: HardwareDraft;
  issues: HardwareIssue[];
  onChange: (draft: HardwareDraft) => void;
}

export function HardwareLayoutStep({ draft, issues, onChange }: Props) {
  const { hw } = draft;
  const [selected, setSelected] = useState<number | null>(null);
  const direct = hw.wiring.kind === 'direct';
  const labels = hw.keys.map((k) => (direct ? `in ${k.col}` : `${k.row},${k.col}`));
  const flagged = new Set(issues.filter((i) => i.level === 'error').flatMap((i) => i.keys ?? []));
  const setHw = (next: KeyboardHardware) => onChange({ ...draft, hw: next });
  const updateKey = (index: number, patch: Partial<HardwareKey>) =>
    setHw({ ...hw, keys: hw.keys.map((k, i) => (i === index ? { ...k, ...patch } : k)) });
  const add = (side?: Side) => {
    onChange({ hw: addKey(hw, side), origins: [...draft.origins, undefined] });
    setSelected(hw.keys.length);
  };
  const remove = (index: number) => {
    onChange({ hw: deleteKey(hw, index), origins: draft.origins.filter((_, i) => i !== index) });
    setSelected(null);
  };
  const key = selected === null ? undefined : hw.keys[selected];

  return (
    <div className="designer">
      <div className="designer-main">
        <p className="muted small">
          Drag keys to where they are on your keyboard (arrows nudge, Shift: 1 key). Each key shows its matrix
          {direct ? ' input' : ' row,column'}; select one to change it. Keys are numbered in keymap order.
        </p>
        <DesignerCanvas
          layout={hardwareLayout(hw)}
          labels={labels}
          selected={selected}
          flagged={flagged}
          onSelect={setSelected}
          onChange={(layout) => setHw({ ...hw, keys: hw.keys.map((k, i) => ({ ...k, ...layout.keys[i] })) })}
        />
        <HardwareIssueList issues={issues} />
      </div>
      <aside className="designer-panel" aria-label="Key settings">
        <div className="row wrap">
          {hw.split ? (
            <>
              <button type="button" className="button" onClick={() => add('left')}>Add key (left)</button>
              <button type="button" className="button" onClick={() => add('right')}>Add key (right)</button>
            </>
          ) : (
            <button type="button" className="button" onClick={() => add()}>Add key</button>
          )}
        </div>
        {key && selected !== null ? (
          <fieldset className="fieldset">
            <legend>Key {selected}</legend>
            <div className="field-grid">
              {direct ? (
                <LiveNumberField key={`c-${selected}`} label="Input" value={key.col} step={1} scale={1} min={0} onChange={(col) => updateKey(selected, { col })} />
              ) : (
                <>
                  <LiveNumberField key={`r-${selected}`} label="Row" value={key.row} step={1} scale={1} min={0} onChange={(row) => updateKey(selected, { row })} />
                  <LiveNumberField key={`c-${selected}`} label="Column" value={key.col} step={1} scale={1} min={0} onChange={(col) => updateKey(selected, { col })} />
                </>
              )}
              {hw.split && (
                <label className="field">
                  <span className="field-label">Half</span>
                  <select className="input" value={key.side ?? 'left'} onChange={(e) => updateKey(selected, { side: e.target.value === 'right' ? 'right' : 'left' })}>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </label>
              )}
              <UnitField key={`x-${selected}`} label="X" value={key.x} onChange={(x) => updateKey(selected, { x })} />
              <UnitField key={`y-${selected}`} label="Y" value={key.y} onChange={(y) => updateKey(selected, { y })} />
              <UnitField key={`w-${selected}`} label="Width" value={key.w} min={25} onChange={(w) => updateKey(selected, { w })} />
              <UnitField key={`h-${selected}`} label="Height" value={key.h} min={25} onChange={(h) => updateKey(selected, { h })} />
              <RotationField
                key={`rot-${selected}`}
                value={key.r}
                onChange={(r) => updateKey(selected, { r, ...(key.r === 0 && key.rx === 0 && key.ry === 0 ? { rx: key.x + key.w / 2, ry: key.y + key.h / 2 } : {}) })}
              />
            </div>
            <button type="button" className="button danger" onClick={() => remove(selected)}>Delete key</button>
          </fieldset>
        ) : (
          <p className="muted small">Select a key to edit it.</p>
        )}
      </aside>
    </div>
  );
}
```

`HardwareDraft` is a type-only import from `HardwareWizard.tsx`. The import cycle is erased at runtime (`verbatimModuleSyntax` keeps `import type` out).

- [ ] **Step 8: Write `HardwareReviewStep.tsx`**

```tsx
import { useMemo } from 'react';
import { HARDWARE_CONTROLLERS } from '../../core/hardware/controllers.ts';
import { shieldDir } from '../../core/hardware/definition.ts';
import { generateShield } from '../../core/hardware/generate.ts';
import type { KeyboardHardware } from '../../core/hardware/types.ts';
import { hasErrors, type HardwareIssue } from '../../core/hardware/validate.ts';
import { HardwareIssueList } from './HardwareIssueList.tsx';

export function HardwareReviewStep({ hw, issues }: { hw: KeyboardHardware; issues: HardwareIssue[] }) {
  const files = useMemo(() => Object.entries(generateShield(hw)), [hw]);
  const controller = HARDWARE_CONTROLLERS.find((c) => c.id === hw.controller)?.name ?? hw.controller;
  return (
    <div className="stack">
      {hasErrors(issues) ? (
        <p className="field-error">Fix these before going on:</p>
      ) : (
        <p>
          {hw.displayName}: {hw.keys.length} keys{hw.split ? ' on two halves' : ''}, for a {controller}.
        </p>
      )}
      <HardwareIssueList issues={issues} />
      <h3>Files the editor writes</h3>
      <p className="muted small">
        They go in {shieldDir(hw.name)}/ in your repo, next to the keymap, and are regenerated whenever you edit the hardware.
      </p>
      {files.map(([path, text]) => (
        <details key={path} className="raw-conf">
          <summary className="mono">{path}</summary>
          <pre className="source" aria-label={path}>{text}</pre>
        </details>
      ))}
    </div>
  );
}
```

- [ ] **Step 9: Write `HardwareWizard.tsx`**

```tsx
import { useState, type Dispatch } from 'react';
import type { ZmkConfig } from '../../core/config.ts';
import { applyHardware, newHardwareConfig } from '../../core/hardware/config.ts';
import { basicsOf, DEFAULT_BASICS, gridHardware, type HardwareBasics } from '../../core/hardware/grid.ts';
import type { KeyboardHardware } from '../../core/hardware/types.ts';
import { hasErrors, validateBasics, validateHardware } from '../../core/hardware/validate.ts';
import { resizeMatrix } from '../../core/hardware/wiring.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { HardwareBasicsStep } from './HardwareBasicsStep.tsx';
import { HardwareLayoutStep } from './HardwareLayoutStep.tsx';
import { HardwareReviewStep } from './HardwareReviewStep.tsx';
import { HardwareWiringStep } from './HardwareWiringStep.tsx';

/** The keyboard being designed; `origins[i]` is key i's index before this edit (undefined for new keys). */
export interface HardwareDraft {
  hw: KeyboardHardware;
  origins: (number | undefined)[];
}

const STEPS = ['Basics', 'Wiring', 'Layout', 'Review'];

/** Changing these rebuilds the grid of a new keyboard. */
const shapeOf = (b: HardwareBasics) => `${b.split}|${b.rows}|${b.cols}|${b.wiring}`;

function anyPin(hw: KeyboardHardware): boolean {
  const w = hw.wiring;
  const pins = w.kind === 'direct' ? [...w.pins, ...(w.right ?? [])] : [...w.rows, ...w.cols, ...(w.right ? [...w.right.rows, ...w.right.cols] : [])];
  return pins.some((p) => p !== null);
}

function freshDraft(basics: HardwareBasics): HardwareDraft {
  const hw = gridHardware(basics);
  return { hw, origins: hw.keys.map(() => undefined) };
}

interface Props {
  config: ZmkConfig;
  dispatch: Dispatch<EditorAction>;
  mode: 'create' | 'edit';
  onDone: () => void;
  onCancel: () => void;
}

export function HardwareWizard({ config, dispatch, mode, onDone, onCancel }: Props) {
  const existing = mode === 'edit' ? config.hardware : undefined;
  const [step, setStep] = useState(0);
  const [basics, setBasics] = useState<HardwareBasics>(() => (existing ? basicsOf(existing) : DEFAULT_BASICS));
  const [draft, setDraft] = useState<HardwareDraft>(() =>
    existing ? { hw: existing, origins: existing.keys.map((_, i) => i) } : freshDraft(DEFAULT_BASICS),
  );
  const [shape, setShape] = useState(() => shapeOf(basics));
  const basicsIssues = validateBasics(basics);
  const issues = validateHardware(draft.hw);

  const leaveBasics = () => {
    const { hw } = draft;
    if (!existing && shapeOf(basics) !== shape) {
      if (anyPin(hw) && !window.confirm('Changing the size or wiring starts the keys and pins over. Continue?')) return;
      setDraft(freshDraft(basics));
      setShape(shapeOf(basics));
    } else {
      let next: KeyboardHardware = { ...hw, name: basics.name, displayName: basics.displayName, controller: basics.controller };
      if (next.wiring.kind === 'matrix') {
        next = { ...next, wiring: { ...next.wiring, diodeDirection: basics.diodeDirection } };
        if (existing) next = resizeMatrix(next, basics.rows, basics.cols);
      }
      setDraft({ ...draft, hw: next });
    }
    setStep(1);
  };

  const finish = () => {
    if (existing) {
      const { config: next, notes } = applyHardware(config, draft.hw, draft.origins);
      dispatch({ type: 'editConfig', config: next, notice: ['Saved the keyboard’s hardware.', ...notes].join(' ') });
    } else {
      if (!window.confirm(`Start a new config for ${draft.hw.displayName}? This replaces what's in the editor (your repo is untouched until you commit).`)) return;
      dispatch({ type: 'load', config: newHardwareConfig(draft.hw, config.west.zmkVersion), warnings: [] });
    }
    onDone();
  };

  return (
    <div className="hardware-wizard">
      <h2 className="panel-title">{existing ? `Edit hardware · ${existing.displayName}` : 'Design your own keyboard'}</h2>
      <ol className="wizard-steps" aria-label="Steps">
        {STEPS.map((name, i) => (
          <li key={name} className={i === step ? 'active' : undefined} aria-current={i === step ? 'step' : undefined}>
            {i + 1}. {name}
          </li>
        ))}
      </ol>
      {step === 0 && <HardwareBasicsStep basics={basics} editing={Boolean(existing)} issues={basicsIssues} onChange={setBasics} />}
      {step === 1 && <HardwareWiringStep hw={draft.hw} issues={issues.filter((i) => i.area === 'wiring')} onChange={(hw) => setDraft({ ...draft, hw })} />}
      {step === 2 && <HardwareLayoutStep draft={draft} issues={issues.filter((i) => i.area === 'keys')} onChange={setDraft} />}
      {step === 3 && <HardwareReviewStep hw={draft.hw} issues={issues} />}
      <div className="row">
        <button type="button" className="button" onClick={step === 0 ? onCancel : () => setStep(step - 1)}>
          {step === 0 ? 'Cancel' : 'Back'}
        </button>
        {step < 3 ? (
          <button type="button" className="button primary" disabled={step === 0 && hasErrors(basicsIssues)} onClick={step === 0 ? leaveBasics : () => setStep(step + 1)}>
            Next
          </button>
        ) : (
          <button type="button" className="button primary" disabled={hasErrors(issues)} onClick={finish}>
            {existing ? 'Save hardware' : 'Create keyboard'}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Hook the wizard up in `App.tsx` and `KeyboardView.tsx`**

`App.tsx`:
1. Extend the view type: `type View = … | 'designer' | 'newKeyboard' | 'editHardware';`.
2. The badge's `active` check becomes `['keyboard', 'designer', 'newKeyboard', 'editHardware'].includes(view)`.
3. Import `HardwareWizard`.
4. Add a branch after the `designer` one:

```tsx
      ) : view === 'newKeyboard' || view === 'editHardware' ? (
        <main className="workspace single">
          <HardwareWizard
            key={view}
            config={config}
            dispatch={dispatch}
            mode={view === 'editHardware' ? 'edit' : 'create'}
            onDone={() => setView(view === 'editHardware' ? 'keyboard' : 'keymap')}
            onCancel={() => setView('keyboard')}
          />
        </main>
```

5. Pass `onNewKeyboard={() => setView('newKeyboard')}` and `onEditHardware={() => setView('editHardware')}` to `KeyboardView`.

`KeyboardView.tsx`:
1. Add the optional props `onNewKeyboard?: () => void; onEditHardware?: () => void;`.
2. The name line shows `{config.hardware?.displayName ?? current?.name ?? config.keyboard}`.
3. When `config.hardware` is set:
   - show `<p className="small">Your own keyboard, defined in config/boards/shields/{config.keyboard}/.</p>`;
   - show an "Edit hardware" button (`onClick={onEditHardware}`) instead of "Open layout designer";
   - hide the "isn't in ZMK's keyboard list" note.
4. Add a section between "This config" and `<NewConfig …/>`:

```tsx
      {onNewKeyboard && (
        <section className="build-section" aria-label="Design your own keyboard">
          <h2 className="panel-title">Your own keyboard</h2>
          <p className="muted small">
            Built one yourself, or designing a PCB? Describe its controller, wiring and layout, and the editor writes the ZMK
            files for it.
          </p>
          <button type="button" className="button" onClick={onNewKeyboard}>Design your own keyboard</button>
        </section>
      )}
```

- [ ] **Step 11: Add the wizard styles** to `src/ui/styles.css`. Put them after the layout designer block and use the existing tokens:

```css
/* Keyboard wizard */
.hardware-wizard {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.wizard-steps {
  display: flex;
  gap: 16px;
  list-style: none;
  margin: 0;
  padding: 0;
  color: var(--text-muted);
}

.wizard-steps .active {
  color: var(--accent);
  font-weight: 600;
}

.wiring-step {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  align-items: start;
}

.pin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
}

.pinout-board {
  display: flex;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--keycap-edge);
  border-radius: 10px;
}

.pinout-column {
  display: flex;
  flex-direction: column;
  gap: 4px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.pinout-usb {
  align-self: start;
  padding: 4px 10px;
  border: 1px solid var(--keycap-edge);
  border-radius: 6px;
  color: var(--text-muted);
}

.pinout-pad {
  display: flex;
  gap: 6px;
  align-items: baseline;
  min-width: 96px;
  padding: 2px 8px;
  border: 1px solid var(--keycap-edge);
  border-radius: 6px;
  background: var(--keycap);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}

.pinout-pad.power {
  cursor: default;
  color: var(--text-muted);
}

.pinout-pad.used {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.pinout-sub,
.pinout-use {
  font-size: 0.8em;
  color: var(--text-muted);
}

@media (max-width: 800px) {
  .wiring-step {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 12: Run the tests to verify they pass**

Run: `npx vitest run src/ui && npm run lint && npm run typecheck`
Expected: PASS. If a query in `NewKeyboard.test.tsx` doesn't match, first check that the label text matches the component. Don't loosen the test.

- [ ] **Step 13: Commit**

```bash
git add src/ui
git commit -m "Add the Design your own keyboard wizard"
```

---

### Task 12: Edit hardware later

**Files:**
- Test: `src/ui/NewKeyboard.test.tsx` (the wizard already supports `mode="edit"` from Task 11)
- Modify: only what this test turns up.

- [ ] **Step 1: Write the failing test** — append to `src/ui/NewKeyboard.test.tsx`, and add these imports: `newHardwareConfig` (`../core/hardware/config.ts`), `DEFAULT_BASICS` and `gridHardware` (`../core/hardware/grid.ts`), and `createCombo` (`../core/keymap/comboEdit.ts`).

```tsx
describe('Edit hardware', () => {
  it('deletes a key later, keeps the keymap and combos in step, and can be undone', async () => {
    const hw = {
      ...gridHardware({ ...DEFAULT_BASICS, name: 'test_pad', displayName: 'Test Pad', split: false, wiring: 'direct', rows: 1, cols: 3 }),
      wiring: { kind: 'direct' as const, pins: [4, 5, 6] },
    };
    const config = newHardwareConfig(hw, 'v0.3');
    config.keymap = { ...config.keymap, combos: [createCombo(config.keymap, [1, 2])] };
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config }));

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Test Pad ▾' }));
    await user.click(screen.getByRole('button', { name: 'Edit hardware' }));
    expect(screen.getByLabelText('Id')).toHaveProperty('disabled', true);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(canvasKey(0));
    await user.click(screen.getByRole('button', { name: 'Delete key' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Save hardware' }));

    expect(screen.getByRole('status').textContent).toMatch(/Saved the keyboard’s hardware/);
    const saved = stored();
    expect(saved.keymap.layers[0].bindings.map((b: { params: string[] }) => b.params[0])).toEqual(['W', 'E']);
    expect(saved.keymap.combos[0].keyPositions).toEqual(['0', '1']);

    await user.keyboard('{Control>}z{/Control}');
    expect(stored().hardware.keys).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/ui/NewKeyboard.test.tsx`
Expected: PASS if Task 11 is complete. If it fails, fix the component, then re-run. A likely cause is a focus problem with undo: the App ignores Ctrl+Z while an input has focus. The fix is to move focus to `document.body` after saving, not to change the test.

- [ ] **Step 3: Commit**

```bash
git add src/ui
git commit -m "Test editing a designed keyboard's hardware, with undo"
```

---

### Task 13: Docs, full verification, PR

**Files:**
- Modify: `README.md` (feature list), `docs/HANDOFF.md`

- [ ] **Step 1: Update the docs.**
  - `README.md`: add "Design your own keyboard (Pro Micro nRF52840; matrix or direct wiring; split or one piece)" to the feature list.
  - `docs/HANDOFF.md`:
    - add a row to the "What's done" table: `| Designing your own keyboard: wizard, generated shield, hardware editing | core/hardware, HardwareWizard |`;
    - under "Known limits", add: "Designed keyboards can't change id, split or wiring kind; encoders, displays and lighting are Stages 2–3 of docs/specs/2026-09-27-custom-keyboards-design.md."

- [ ] **Step 2: Run the full check**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all pass. Read the output. Don't claim success without it.

- [ ] **Step 3: Try it in the running app**

Run `npm run dev`, open the app, and go through the wizard: a split 3×6 with a few pins, thumb keys added, then Create. Check:
- the keymap view draws the new keyboard;
- "Download config (.zip)" contains `config/boards/shields/<name>/…`;
- "Edit hardware" reopens the wizard with the pins filled in.

- [ ] **Step 4: Commit, push, open the PR**

```bash
git add README.md docs/HANDOFF.md
git commit -m "Document designing your own keyboard"
git push origin HEAD
gh pr create --base main --title "Design your own keyboard (Stage 1)" --body-file <file with summary, test plan, and the Claude Code footer>
```

After the PR is open, check that the **Firmware build check** workflow built all seven targets:
- Lily58: left and right;
- `editor_split`: left and right;
- `editor_numpad`: one target;
- `editor_duo`: left and right.

A failed target means the generated devicetree or Kconfig is wrong for ZMK. Fix it in `generate.ts`, re-run `npx vitest run -u` and push. Report the result to the owner: what changed, what was verified, and any caveats.
