# Interconnects (Seeed XIAO first) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the keyboard wizard design keyboards for the Seeed XIAO nRF52840 by deriving pins, node labels, display pins and the pinout drawing from the controller's interconnect.

**Architecture:** A data table `INTERCONNECTS` in `src/core/hardware/interconnects.ts` describes each footprint. `interconnectOf(controller)` picks one from the catalog's `exposes`. The generator, displays, validation, pin uses and the wizard UI read from it instead of the Pro Micro constants. There is no file-format change.

**Tech Stack:** TypeScript, React 19, vitest (+ Testing Library, jsdom).

**Spec:** `docs/specs/2026-09-30-interconnects-xiao-design.md`

## Global Constraints

- **Generated output:** the shield files for existing Pro Micro designs must not change, byte for byte. The golden tests in Task 1 guard this.
- **Definitions:** stay at `VERSION = 1`. There is no new field; the interconnect is derived from `controller`.
- **Controllers:** only wireless controllers are offered. The only new one is `seeeduino_xiao_ble`.
- **XIAO:**
  - `gpio: xiao_d` and `i2c: xiao_i2c`, with `requires: [seeed_xiao]`.
  - pins D0–D10; OLED pins D4 (SDA) and D5 (SCL);
  - no nice!view.
- **Pins the controller doesn't have** are kept and flagged, never cleared.
- **Process:**
  - Run tests with `npx vitest run --maxWorkers=6`.
  - New files are formatted with `npx prettier --single-quote --print-width 130 --write <file>`. Don't run Prettier on existing files (no repo config).
  - Scripted edits keep CRLF (`newline=''`).
- **CSS:** check class names are free before choosing one (`.knob` was taken before). Use design tokens only.

## Review Focus

1. **Switching an existing Pro Micro design to a XIAO:** pins above 10 and a chosen nice!view must be flagged, not crash or silently vanish. Tested in Tasks 4 and 5.
2. **An unknown or missing controller id** (hand-edited definition) must fall back to the Pro Micro and still validate as "isn't a supported controller". Tested in Task 2.
3. **Encoders and a display on the XIAO's I2C pins** (e.g. encoder on D4 with an OLED) must be flagged as a conflict. Tested in Task 5.
4. **The pinout's top/bottom toggle** must swap the XIAO's columns like the Pro Micro's, and power pads must not be clickable. Tested in Task 6.
5. **Switching controllers in the wizard** must not reset other wizard state (keys, wiring). Tested in Task 6.

---

### Task 1: Golden tests for today's Pro Micro output

**Files:**
- Create: `src/core/hardware/golden.test.ts` (snapshot in `src/core/hardware/__snapshots__/golden.test.ts.snap`)

- [ ] **Step 1:** Write snapshot tests:
  - a Pro Micro split with:
    - matrix 2×3, row2col;
    - the right half wired differently;
    - encoders on both halves;
    - an OLED 128×32 on the left and a 128×64 on the right;
  - `testPad` with a nice!view and one encoder.

  Both use `expect(generateShield(hw)).toMatchSnapshot()`.
- [ ] **Step 2:** Run the tests; they write the snapshot. Read the snapshot to confirm it's sane: `&pro_micro`, `&pro_micro_i2c`, `requires: [pro_micro]`.
- [ ] **Step 3:** Commit: "Golden tests for today's Pro Micro shield output".

### Task 2: The interconnect model

**Files:**
- Create: `src/core/hardware/interconnects.ts`, `src/core/hardware/interconnects.test.ts`
- Modify: `src/core/hardware/controllers.ts` (keep `HARDWARE_CONTROLLERS`; move the header and pins to interconnects; drop `isNiceNano`), `src/core/hardware/controllers.test.ts`

**Interfaces (produces):**
```ts
export interface HeaderPad { pin: number | null; label: string; mcu?: Record<string, string> }
export interface Interconnect {
  id: 'pro_micro' | 'seeed_xiao'; name: string; gpio: string; i2c: string;
  header: { left: HeaderPad[]; right: HeaderPad[] }; pins: number[];
  i2cPins: { sda: number; scl: number }; niceViewAdapter: boolean;
}
export const PRO_MICRO: Interconnect; export const SEEED_XIAO: Interconnect;
export const INTERCONNECTS: Interconnect[];
export function interconnectOf(controller: string): Interconnect;
export const pinLabel: (pin: number) => string; // `D${pin}`
// controllers.ts
export const HARDWARE_CONTROLLERS: ControllerData[]; // ble && exposes a known interconnect && !_52833
```

- [ ] **Step 1: Failing tests** (`interconnects.test.ts`):
  - `PRO_MICRO.pins` equals `[0,1,2,3,4,5,6,7,8,9,10,14,15,16,18,19,20,21]`, with 12 pads per side (moved from `controllers.test.ts`).
  - `SEEED_XIAO.pins` equals `[0..10]`.
  - The XIAO header:
    - left labels `D0…D6`;
    - right labels `5V, GND, 3V3, D10, D9, D8, D7`;
    - `mcu.seeeduino_xiao_ble` of D4 is `P0.04`, of D10 is `P1.15`.
  - `interconnectOf('nice_nano_v2') === PRO_MICRO`, `interconnectOf('seeeduino_xiao_ble') === SEEED_XIAO`, and `interconnectOf('nope') === PRO_MICRO`.
  - Node labels: `SEEED_XIAO.gpio === 'xiao_d'`, `SEEED_XIAO.i2c === 'xiao_i2c'`, `SEEED_XIAO.i2cPins` is `{ sda: 4, scl: 5 }`, and `PRO_MICRO.i2cPins` is `{ sda: 2, scl: 3 }`.
  - `controllers.test.ts`: `HARDWARE_CONTROLLERS` ids include `nice_nano_v2` and `seeeduino_xiao_ble`, and exclude `seeeduino_xiao_rp2040`, `sparkfun_pro_micro_rp2040` and `nice_nano_v2_52833`-style ids.
- [ ] **Step 2:** Run; it fails because the module is missing.
- [ ] **Step 3: Implement.**
  - **Pro Micro header:** copy from `controllers.ts`, with `mcu: { nice_nano: 'P0.06', nice_nano_v2: 'P0.06' }` built by a helper `pad(pin, nrf)`.
  - **XIAO header:** from the spec table, with `mcu: { seeeduino_xiao_ble: … }`.
  - **`interconnectOf`:** `CONTROLLER_DATA.find(c => c.id === controller)?.exposes`, then the first matching interconnect id, falling back to `PRO_MICRO`.
  - **`controllers.ts`:**
    ```ts
    HARDWARE_CONTROLLERS = CONTROLLER_DATA.filter(c => c.ble && !c.id.endsWith('_52833') && c.exposes.some(e => INTERCONNECTS.some(i => i.id === e)))
    ```
    Re-export nothing else; update imports in `validate.ts`, `HardwareWiringStep.tsx`, `ProMicroPinout.tsx` and `NewKeyboard.test.tsx` to use `PRO_MICRO`/`pinLabel` from `interconnects.ts`.
  - **`ProMicroPinout.tsx`:** the sub-label now reads `pad.mcu?.[hw.controller]`.
- [ ] **Step 4:** Run the whole suite; everything is green, including the golden tests.
- [ ] **Step 5:** Commit: "Interconnect model: Pro Micro and Seeed XIAO footprints".

### Task 3: Display pins from the interconnect

**Files:** Modify `src/core/hardware/displays.ts`, `displays.test.ts`, `wiring.ts` (`pinUses`).

**Interfaces (produces):**
```ts
export const DISPLAYS: Record<DisplayKind, { label: string }>;
export function displayPins(kind: DisplayKind, ic: Interconnect): { pin: number; use: string }[];
export function availableDisplays(ic: Interconnect): DisplayKind[]; // XIAO: oled_128x32, oled_128x64
```

- [ ] **Step 1: Failing tests:**
  - `displayPins('nice_view', PRO_MICRO)` gives pins `[1,2,3]`.
  - `displayPins('oled_128x32', PRO_MICRO)` gives `[{2,'Display SDA'},{3,'Display SCL'}]`.
  - `displayPins('oled_128x64', SEEED_XIAO)` gives `[{4,'Display SDA'},{5,'Display SCL'}]`.
  - `availableDisplays(SEEED_XIAO)` equals `['oled_128x32','oled_128x64']`; on the Pro Micro it is all three.
  - `pinUses` of a XIAO split with an OLED on the left maps 4 → `['Display SDA']`.
- [ ] **Step 2:** Run; it fails.
- [ ] **Step 3:** Implement.
  - The nice!view keeps its fixed pins: `[{1,'Display CS'},{2,'Display data'},{3,'Display clock'}]`. Its entry in `displayPins` is used even on a XIAO, so that a flagged nice!view still shows up in conflicts.
  - `pinUses` calls `displayPins(display, interconnectOf(hw.controller))`.
- [ ] **Step 4:** Run the suite; it passes.
- [ ] **Step 5:** Commit.

### Task 4: Generator writes the interconnect's labels

**Files:** Modify `src/core/hardware/generate.ts`; Test `generate.test.ts`.

- [ ] **Step 1: Failing tests** for a XIAO (`controller: 'seeeduino_xiao_ble'`):
  - A one-piece direct-wired pad on pins `[0, 10]` gives:
    ```
    input-gpios
        = <&xiao_d  0 (GPIO_ACTIVE_LOW | GPIO_PULL_UP)>
        , <&xiao_d 10 (GPIO_ACTIVE_LOW | GPIO_PULL_UP)>
    ```
    and a `.zmk.yml` containing `requires: [seeed_xiao]`.
  - A split with an encoder gives `a-gpios = <&xiao_d  8 (GPIO_ACTIVE_HIGH | GPIO_PULL_UP)>;`.
  - With an OLED, the overlay contains `&xiao_i2c {` and no `pro_micro`.
- [ ] **Step 2:** Run; it fails.
- [ ] **Step 3:** Implement.
  - `const ic = interconnectOf(hw.controller)` is passed into `gpioList`, `encoderNodes`, `oledNodes` and `zmkYml`.
  - They write `&${ic.gpio}`, `&${ic.i2c} {` and `requires: [${ic.id}]`.
  - Padding stays `padStart(2)`.
- [ ] **Step 4:** Run the suite. The golden tests must be unchanged, and so must the existing `generate.test.ts`.
- [ ] **Step 5:** Commit.

### Task 5: Validation per interconnect

**Files:** Modify `src/core/hardware/validate.ts`; Test `validate.test.ts`.

- [ ] **Step 1: Failing tests** (XIAO = `{ ...wired(), controller: 'seeeduino_xiao_ble' }`, with `wired()` rows `[4,5]` and cols `[6,7,8]`):
  - A XIAO with a col at pin 14 gives `Column 2 on the left half uses D14, which isn’t a Seeed XIAO pin.` Match the existing wording and its `’`.
  - `validateBasics({...basics, controller: 'seeeduino_xiao_ble', rows: 6, cols: 7})` gives `A 6 × 7 matrix needs 13 pins per half, but a Seeed XIAO has 11.`
  - The Pro Micro message becomes `…, but a Pro Micro has 18.`; update the existing test.
  - `setDisplay(xiao, 'left', 'nice_view')` gives `A nice!view needs the Pro Micro adapter; on a Seeed XIAO use an OLED for now.`, at area `wiring`.
  - A XIAO with an OLED and encoder A on D4 gives `D4 is used for both Encoder 0 A and Display SDA on the left half.` (or the existing conflict wording and order).
  - An unknown controller still gives `nope isn’t a supported controller.`
- [ ] **Step 2:** Run; it fails.
- [ ] **Step 3:** Implement.
  - `const ic = interconnectOf(controller)`.
  - Pin counts use `ic.pins`; the "isn't a pin" check uses `ic.pins` and `ic.name`.
  - Display pins come from `displayPins`.
  - The nice!view error is raised when `display === 'nice_view' && !ic.niceViewAdapter`.
- [ ] **Step 4:** Run the suite; it passes.
- [ ] **Step 5:** Commit.

### Task 6: Wizard UI

**Files:**
- Create: `src/ui/components/ControllerPinout.tsx` (replaces `ProMicroPinout.tsx`, which is deleted)
- Modify: `HardwareWiringStep.tsx`, `HardwareBasicsStep.tsx`
- Test: `src/ui/NewKeyboard.test.tsx` (add a `describe('Seeed XIAO')`)

- [ ] **Step 1: Failing UI tests**, reusing the wizard helpers in `NewKeyboard.test.tsx`:
  - The Basics controller select has the groups `Pro Micro footprint` and `Seeed XIAO footprint`, with the option "Seeed Studio XIAO nRF52840".
  - After picking the XIAO:
    - the Wiring step shows a figure named `Seeed XIAO pinout (left half)`;
    - the pin selects have 11 pin options plus "No pin";
    - clicking a field and then the pad `D10` sets it;
    - the power pads `5V`/`GND`/`3V3` are not buttons.
  - The display select on a XIAO has no `nice_view` option, and shows the note "OLEDs use D4 (SDA) and D5 (SCL)".
  - Switching from a Pro Micro design with row pin 21 to the XIAO keeps the keys and the other pins, and lists "uses D21, which isn’t a Seeed XIAO pin".
  - The top/bottom toggle swaps the columns: from below, the first left pad is `5V`.
- [ ] **Step 2:** Run; it fails.
- [ ] **Step 3:** Implement.
  - **`ControllerPinout`:** `ProMicroPinout` with `ic = interconnectOf(hw.controller)`, `ic.header`, the sub-label `pad.mcu?.[hw.controller]`, and aria-label `${ic.name} pinout`. Keep the existing CSS classes (`.pinout*`).
  - **Wiring step pin selects:** `interconnectOf(hw.controller).pins`.
  - **Display select:** `availableDisplays(ic)`, plus the already-chosen kind when it isn't available, so it stays visible and flagged. The label uses `displayPins(kind, ic)`. On the XIAO it shows the note from the spec.
  - **Basics step:** `<optgroup label={`${ic.name} footprint`}>` per interconnect, in `INTERCONNECTS` order.
- [ ] **Step 4:** Run the suite; it passes. Run `npx tsc -b` and `npx eslint` on the changed files.
- [ ] **Step 5:** Commit.

### Task 7: Review and hand-over

- [ ] One fresh whole-branch review by a general-purpose agent on opus. Fix Critical and Important findings, with failing tests first.
- [ ] Probe the dev server on port 5174 with Playwright for `pageerror`. Take screenshots of the Basics step and the Wiring step on a XIAO.
- [ ] Hand over to the user. Push and open the PR only when they say so.
