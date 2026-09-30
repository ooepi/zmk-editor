# Display Pins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each half's display pins be chosen in the keyboard wizard, and build a nice!view on any pins (including on the Seeed XIAO) with the shield's own SPI bus.

**Architecture:**
- Display pins are stored as per-half overrides of per-footprint defaults (`KeyboardHardware.displayPins`).
- The generator turns non-default pins into nRF52840 pinctrl, using each board's D-pin → nRF map in `interconnects.ts`.
- A nice!view off the adapter's pins defines `nice_view_spi` itself, so it builds without `nice_view_adapter`.

**Tech Stack:** TypeScript, React 19, vitest (+ Testing Library, jsdom).

**Spec:** `docs/specs/2026-09-30-display-pins-design.md`

## Global Constraints

- **Unchanged output:** designs whose displays are on their default pins generate exactly the same files as before (golden tests), except a nice!view on a XIAO, which was not possible before.
- **Definition versions:** a definition is written as version 2 only when `displayPins` has overrides. Version 1 and 2 both parse.
- **Default pins:**
  - nice!view on a Pro Micro: cs D1, data D2, clock D3 (via the adapter).
  - nice!view on a XIAO: cs D9, data D10, clock D8.
  - OLED: the footprint's `i2cPins`.
- **Signal names and uses:**
  - `cs` "Display CS", `data` "Display data", `clock` "Display clock";
  - `sda` "Display SDA", `scl` "Display SCL".
- **Pinctrl node labels:** `nice_view_spi_default`, `nice_view_spi_sleep`, `oled_i2c_default`, `oled_i2c_sleep`.
- **Process:**
  - Run tests with `npx vitest run --maxWorkers=6`.
  - Prettier only on new files (`--single-quote --print-width 130`).
  - Keep CRLF when editing files. Do not put `\n` escape sequences through Python; use the Edit tool for those.

## Review Focus

1. **A display kind change** (nice!view → OLED) must drop that half's pin overrides, so stale `cs` pins don't linger in the definition. Tested in Task 1.
2. **Switching a customised Pro Micro nice!view back to the default pins** must restore the adapter in build.yaml and keep a Screens replacement (e.g. `nice_view_gem`). Tested in Task 4.
3. **A mirrored right half with its own display** (split, right half not wired differently): its display pins must be checked against the mirrored matrix pins. Tested in Task 5.
4. **A definition whose `displayPins` has an unknown signal or a non-number pin** must be rejected with a clear message, not crash. Tested in Task 1.
5. **Switching a XIAO nice!view design back to a Pro Micro:** a XIAO nice!view on its defaults has no overrides, so it moves to the Pro Micro defaults (D1/D2/D3) and the build uses the adapter again; overrides, where there are any, are kept. Tested in Task 4.

---

### Task 1: Model, defaults and definitions

**Files:** `src/core/hardware/types.ts`, `displays.ts`, `definition.ts`, `wiring.ts` (`pinUses`) and their tests.

**Produces:**
```ts
// types.ts
export type DisplaySignal = 'cs' | 'data' | 'clock' | 'sda' | 'scl';
export type DisplayPinOverrides = Partial<Record<DisplaySignal, Pin>>;
KeyboardHardware.displayPins?: { left?: DisplayPinOverrides; right?: DisplayPinOverrides };
// displays.ts
export interface DisplayPin { signal: DisplaySignal; pin: Pin; use: string }
export function defaultDisplayPins(kind: DisplayKind, ic: Interconnect): DisplayPin[];
export function displayPins(kind: DisplayKind, ic: Interconnect, overrides?: DisplayPinOverrides): DisplayPin[];
export function halfDisplayPins(hw: KeyboardHardware, side?: Side): DisplayPin[]; // [] without a display
export function setDisplayPin(hw: KeyboardHardware, side: Side | undefined, signal: DisplaySignal, pin: Pin): KeyboardHardware;
export function clearDisplayPins(hw: KeyboardHardware, side: Side | undefined): KeyboardHardware;
export function usesNiceViewAdapter(hw: KeyboardHardware, side?: Side): boolean;
```

- [ ] **Step 1: Failing tests (`displays.test.ts`):**
  - Defaults:
    - `defaultDisplayPins('nice_view', PRO_MICRO)` gives `[{cs,1,'Display CS'},{data,2,'Display data'},{clock,3,'Display clock'}]`.
    - On `SEEED_XIAO`: `[{cs,9},{data,10},{clock,8}]`.
    - OLED on the XIAO: `[{sda,4,'Display SDA'},{scl,5,'Display SCL'}]`.
  - `setDisplayPin(setDisplay(testSplit,'left','nice_view'),'left','cs',5)`:
    - gives `displayPins: { left: { cs: 5 } }` and `halfDisplayPins(…,'left')[0].pin === 5`;
    - setting it back to 1 removes `displayPins` entirely.
  - `setDisplay(…, 'left', 'oled_128x32')` on a half with overrides removes them (Review Focus 1).
  - `usesNiceViewAdapter`:
    - true for a Pro Micro nice!view on defaults;
    - false with cs 5;
    - false on a XIAO;
    - false for an OLED.
  - `clearDisplayPins` removes one half's overrides.
- [ ] **Step 2: Failing tests (`definition.test.ts`):**
  - A round trip with `displayPins: { right: { sda: 6, scl: 7 } }` writes `"version": 2` and parses back equal.
  - Without overrides it writes `"version": 1`.
  - `displayPins.left.foo` is rejected with `displayPins.left.foo isn’t a display signal`.
  - `displayPins.left.cs = "x"` is rejected with `displayPins.left.cs must be a number` (Review Focus 4).
  - Version 3 is rejected with the existing message.
- [ ] **Step 3: Run; the tests fail.**
- [ ] **Step 4: Implement.**
  - Replace `displayPins(kind, ic)` (Task 3 of the previous plan) with the overrides version. Keep `DISPLAY_KINDS`, `DISPLAYS` and `availableDisplays`; `availableDisplays` now returns every kind.
  - `setDisplay` drops that side's overrides.
  - `pinUses` uses `halfDisplayPins`, skipping null pins.
  - Definition serialize: after `displays`, add `displayPins` when there are overrides (left/right, signals in `cs, data, clock, sda, scl` order); `version: hw.displayPins ? 2 : 1`.
  - Definition parse: accept version 1 or 2; parse `displayPins` with the checks above.
- [ ] **Step 5: Run the whole suite. Golden tests must pass.** Update callers of the old `displayPins(kind, ic)`:
  - `validate.ts` uses `halfDisplayPins`;
  - the `HardwareWiringStep` option label uses `defaultDisplayPins(kind, ic)` for the kind's defaults.
- [ ] **Step 6: Commit.**

### Task 2: Board pin maps

**Files:** `src/core/hardware/interconnects.ts`, `interconnects.test.ts`.

**Produces:** `export function nrfPin(controller: string, pin: number): { port: number; pin: number } | undefined`.

- [ ] **Step 1: Failing tests:**
  - `nrfPin('nice_nano_v2', 2)` is `{port:0,pin:17}`;
  - `nrfPin('puchi_ble_v1', 2)` is `{port:0,pin:15}`;
  - `nrfPin('bluemicro840_v1', 20)` is `{port:0,pin:26}`;
  - `nrfPin('nrfmicro_11_flipped', 2)` is `{port:0,pin:30}`;
  - `nrfPin('mikoto', 6)` is `{port:1,pin:0}`;
  - `nrfPin('seeeduino_xiao_ble', 10)` is `{port:1,pin:15}`;
  - `nrfPin('nice_nano_v2', 11)` is undefined;
  - every `HARDWARE_CONTROLLERS` id maps every pin of its interconnect.
- [ ] **Step 2: Run; the tests fail.**
- [ ] **Step 3: Implement.**
  - Replace `proMicroPad(pin, nrf)` with pads whose `mcu` comes from a table `PRO_MICRO_MAPS: Record<string, Record<number, string>>`, built from the spec table:
    - `nice_nano` and `nice_nano_v2` share one map;
    - `nrfmicro_11`, `nrfmicro_13` and `puchi_ble_v1` share one;
    - `bluemicro840_v1` differs only in D20;
    - `nrfmicro_11_flipped` has its own;
    - `mikoto` has its own.
  - Write each pad's `mcu` as `{ [controller]: 'P0.17', … }` for every controller.
  - `nrfPin` finds the pad in `interconnectOf(controller).header` and parses `P(\d)\.(\d+)`.
  - Keep the zero-padded style of the existing labels (`P0.06`).
- [ ] **Step 4: Run the whole suite.** Existing tests expect `PRO_MICRO.header.left[0].mcu` to be `{ nice_nano, nice_nano_v2 }`; update that test to check `mcu.nice_nano_v2 === 'P0.06'` and `mcu.puchi_ble_v1 === 'P0.06'`.
- [ ] **Step 5: Commit.**

### Task 3: Generator

**Files:** `src/core/hardware/generate.ts`, `generate.test.ts`.

- [ ] **Step 1: Failing tests:**
  - **nice!nano one-piece pad with a nice!view, cs 5** (`setDisplayPin(setDisplay(testPad, undefined, 'nice_view'), undefined, 'cs', 5)`, with pins D4/D5 moved away: `wiring.pins [6, 7]`). The overlay contains exactly:
    ```
    &pinctrl {
        nice_view_spi_default: nice_view_spi_default {
            group1 {
                psels = <NRF_PSEL(SPIM_SCK, 0, 20)>,
                    <NRF_PSEL(SPIM_MOSI, 0, 17)>;
            };
        };
        nice_view_spi_sleep: nice_view_spi_sleep {
            group1 {
                psels = <NRF_PSEL(SPIM_SCK, 0, 20)>,
                    <NRF_PSEL(SPIM_MOSI, 0, 17)>;
                low-power-enable;
            };
        };
    };

    nice_view_spi: &pro_micro_spi {
        compatible = "nordic,nrf-spim";
        pinctrl-0 = <&nice_view_spi_default>;
        pinctrl-1 = <&nice_view_spi_sleep>;
        pinctrl-names = "default", "sleep";
        cs-gpios = <&pro_micro 5 GPIO_ACTIVE_HIGH>;
    };

    &pro_micro_i2c {
        status = "disabled";
    };
    ```
  - **XIAO split with a left nice!view on defaults:** the left overlay contains `nice_view_spi: &xiao_spi {`, `NRF_PSEL(SPIM_SCK, 1, 13)`, `NRF_PSEL(SPIM_MOSI, 1, 15)` and `cs-gpios = <&xiao_d 9 GPIO_ACTIVE_HIGH>;`. The right overlay has no `nice_view_spi`.
  - **Puchi-BLE split with a left OLED on SDA D4, SCL D5:** the left overlay contains `oled_i2c_default`, `NRF_PSEL(TWIM_SDA, 0, 20)` and `NRF_PSEL(TWIM_SCL, 0, 13)`, and the `&pro_micro_i2c {` block has `pinctrl-0 = <&oled_i2c_default>;` right after `status = "okay";`.
  - **A Pro Micro nice!view on defaults** has no `nice_view_spi` in any file. The golden tests cover the unchanged rest.
- [ ] **Step 2: Run; the tests fail.**
- [ ] **Step 3: Implement.**
  - `psel(name, controller, pin)` returns `NRF_PSEL(${name}, ${port}, ${pin})`, or `NRF_PSEL(${name}, ?, ?)` when unmapped.
  - `pinctrlNodes(label, psels)` returns the `&pinctrl` block above.
  - `niceViewNodes(hw, side)` is written only when `halfDisplay === 'nice_view' && !usesNiceViewAdapter(hw, side)`.
  - `oledNodes(kind, ic, pins?)` adds the pinctrl block before `&${i2c} {` and the three pinctrl lines after `status = "okay";`, only when the OLED's pins differ from `ic.i2cPins`.
  - Place both in the half overlay and in the one-piece `oledSection`, renamed `displaySection`.
- [ ] **Step 4: Run the whole suite; the golden tests are unchanged.**
- [ ] **Step 5: Commit.**

### Task 4: Build targets and screen slots

**Files:** `src/core/hardware/config.ts`, `config.test.ts`, `src/core/screens.ts`, `screens.test.ts`, `src/ui/components/ScreensView.tsx`, `src/ui/Screens.test.tsx`.

- [ ] **Step 1: Failing tests:**
  - `hardwareBuildTargets` for a XIAO split with a left nice!view gives `['x_left nice_view', 'x_right']`.
  - For a Pro Micro nice!view with cs 5, it gives `'test_split_left nice_view'`.
  - `applyHardware` from a Pro Micro with `test_split_left nice_view_adapter nice_view_gem` to cs 5 gives `test_split_left nice_view_gem`. Back to defaults, it gives `test_split_left nice_view_adapter nice_view_gem` (Review Focus 2).
  - A XIAO nice!view switched to `nice_nano_v2` keeps its overrides (cs 9, data 10, clock 8). `usesNiceViewAdapter` is false, and the targets have no adapter (Review Focus 5).
  - The previous "drop hand-added nice!view shields on a XIAO" test still passes: the half has no nice!view in the model, so both shields are dropped.
  - `screenSlots` of a config whose include is `{ shield: 'x_left nice_view' }` is one slot, "Left", with `screen: null`.
  - The Screens tab on a XIAO design with a nice!view lists the slot. Replace the previous empty-state test.
- [ ] **Step 2: Run; the tests fail.**
- [ ] **Step 3: Implement.**
  - `withDisplayShields(shield, niceView, adapter: boolean)`: the nice!view shields are `adapter ? [ADAPTER, screen] : [screen]`, keeping the chosen screen. "Unchanged" means the exact set is already there.
  - `hardwareBuildTargets` passes `usesNiceViewAdapter(hw, side)`.
  - `applyHardware`:
    - recomputes the half's shields when its nice!view presence or adapter use changed (compared with `config.hardware`);
    - the XIAO rule strips `nice_view_adapter` alone when the half has a nice!view, and all nice!view shields when it doesn't.
  - `screenSlots`: a target is a slot when it has `NICE_VIEW_ADAPTER` or any `SCREEN_SHIELDS` member.
  - `ScreensView`: remove the XIAO empty-state branch.
- [ ] **Step 4: Run the whole suite.**
- [ ] **Step 5: Commit.**

### Task 5: Validation

**Files:** `src/core/hardware/validate.ts`, `validate.test.ts`.

- [ ] **Step 1: Failing tests:**
  - A XIAO with a nice!view on the free right half of a split (rows `[0,1]`, cols `[2,3,4]`, right wired differently with the same pins) has no errors. The old nice!view error is gone.
  - `setDisplayPin(…, 'left', 'cs', null)` gives `Display CS on the left half has no pin.`
  - A Pro Micro nice!view with cs 4 while row 0 is on D4 gives `D4 is used for both Row 0 and Display CS on the left half.`
  - A mirrored split (no `right` wiring) with rows `[4,5]` and a right OLED with sda 4 gives `D4 is used for both Row 0 and Display SDA on the right half.` (Review Focus 3).
  - A Mikoto nice!view with clock 6 gives the warning `Display clock on the left half uses D6, which is a different pin on Mikoto v6 and later; the build assumes Mikoto 5.20.`
- [ ] **Step 2: Run; the tests fail.**
- [ ] **Step 3: Implement.**
  - `labelled` uses `halfDisplayPins(hw, side)`.
  - Remove the nice!view adapter error.
  - Add the Mikoto warning when `hw.controller === 'mikoto'`.
- [ ] **Step 4: Run the whole suite. Update the UI tests from the XIAO PR that expected the nice!view to be blocked.**
- [ ] **Step 5: Commit.**

### Task 6: Wizard UI and Help

**Files:** `src/ui/components/HardwareWiringStep.tsx`, `src/core/hardware/wiring.ts` (`PinList`, `setPin`), `src/ui/help/sections/keyboard.tsx`, `src/ui/NewKeyboard.test.tsx`.

**Produces:** `PinList` gains `` `display.${DisplaySignal}` ``; `setPin` delegates those to `setDisplayPin`.

- [ ] **Step 1: Failing UI tests:**
  - **Pro Micro split:** edit the hardware, then choose a left nice!view.
    - The fields "Left display CS", "Left display data" and "Left display clock" show 1, 2 and 3.
    - Clicking "Left display CS" and then pad D5 on the left pinout sets CS to 5, and the pad reads `D5: Display CS`.
    - "Use the standard pins" sets it back to 1.
    - After saving with CS 5, `build.include[0].shield` is `test_split_left nice_view`.
  - **XIAO:** the display select offers `nice_view`. Choosing it shows CS 9, data 10 and clock 8.
  - **OLED fields** are "Left display SDA" and "Left display SCL".
- [ ] **Step 2: Run; the tests fail.**
- [ ] **Step 3: Implement.**
  - In the Displays fieldset, under each select, when the half has a display, render the display pin fields. Use the existing `PinSelect` with `list: 'display.cs'` and so on, `name` equal to the signal's use ("Display CS"), and label `${Side} display CS`. For a one-piece keyboard the label is `Display CS`.
  - `setPin` handles display lists by calling `setDisplayPin`.
  - The "Use the standard pins" link button shows only when `hw.displayPins?.[side]` exists.
  - Update the help paragraph and the Help page line as in the spec.
- [ ] **Step 4: Run the whole suite, plus `npx tsc -b` and eslint on the changed files.**
- [ ] **Step 5: Commit.**

### Task 7: Review and hand-over

- [ ] One fresh whole-branch review by a general-purpose agent on opus. Fix Critical and Important findings, with failing tests first.
- [ ] Playwright probe of the dev server (port 5174): a XIAO with a nice!view, and a Pro Micro with a custom CS. Screenshot the Wiring step.
- [ ] Hand over to the user. The PR goes on `feat/xiao-interconnect` until #47 merges, then retargets to `main`.
