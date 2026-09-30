# Handoff: the next four features

Written 2026-09-30 at the end of a long session, for the Claude session that picks up next. Read it first, then `docs/design-system.md` and `docs/handoff-zmk-studio.md`; the latter has the working style, Windows gotchas and commands, all still accurate.

## Where the project is

- `main` has everything up to PR #45. #45 adds encoder knobs on the keyboard and the floating layer rail; it may still be open (`gh pr view 45`), so check before branching.
- Recently shipped:
  - #42: ZMK Studio live mode. Confirmed working on the user's real Lily58.
  - #43: WPM widget / stock nice!view clash warning.
  - #44: top bar Studio pill, resizable palette, keymap camera (zoom, pan, fit, dot grid).
  - #45: encoder knobs.
- **The user's process** (unchanged):
  - Brainstorm briefly and get approval of a short design. For big features, write a spec in `docs/specs/` and a plan in `docs/plans/`.
  - Build in-session with TDD, then one fresh whole-branch review by a general-purpose agent on opus. Fix Critical and Important findings with failing tests first.
  - Restart the `dev-5174` preview and hand over. Push and open a PR only when they say so, one PR per feature, from `main`.
  - They like quick `show_widget` mockups when choosing layouts.
- **Gotchas learned this session** (in addition to the Studio handoff's list):
  - **Scripted edits and Vite:** after scripted multi-file edits, Vite can serve a half-updated module (e.g. "rail is not defined") even though `tsc` and the tests pass. Restart the preview, then check with a Playwright probe for `pageerror`.
  - **Python edits:** use the scratchpad helper pattern `edit(path, old, new)`, which keeps CRLF and UTF-8 intact. Never put regexes with backslashes or `\n` template strings through Python; use the Edit tool for those.
  - **Running the generators:** `node --experimental-strip-types scripts/gen-keyboards.ts <zmk checkout> v0.3`. A `--branch v0.3` clone is the v0.3 *branch*, not the exact tag the catalog came from. When you only need a new field, merge it into the existing `keyboards.data.ts` rather than regenerating everything (see how #45 did it).
  - **Screenshots:** a scratch Playwright script against `http://localhost:5174`. Import `file:///D:/fffff/zmk-editor/node_modules/playwright/index.mjs`, and click "Try the demo" with a timeout, because the welcome dialog opens on a fresh profile.
  - **CSS class names:** check before choosing one. `.knob` was already taken in `behaviors.css` and broke the first knob attempt.
  - **Tests counting buttons:** tests that count every button inside `group "Keyboard layout"` now need `name: /^Key \d+:/`, because encoder knobs live in that group.

---

## 1. Layer-usage overview (do this first; the user asked for it)

**Goal:** show how layers reach each other and catch keymap mistakes before a build.

**Idea agreed in chat** (not designed in detail yet; brainstorm it briefly):
- A matrix or small graph: for each layer, what leads to it, and from which layer and key or combo.
- **Warnings:**
  - a layer nothing reaches;
  - a layer you can enter but not leave, e.g. `&to 3` with no way back;
  - keys that are `&trans` on every layer, including the base layer, or `&none` where the layer below has something;
  - momentary keys on the target layer that are covered, e.g. `&mo 1` whose own position on layer 1 isn't `&trans`, so releasing works but pressing again doesn't.
- **Where it could live:** the Keymap tab's Overview panel (shown when nothing is selected, `Overview` in `App.tsx`), as a "Layers" section, or its own dialog opened from the layer rail. Mock both with `show_widget`.

**What activates a layer** (all of these are already modelled):
- **Behaviors with a `layer` param:** `mo`, `lt`, `tog`, `to`, `sl`, and custom hold-taps whose params are layer kind. See `ParamType` `layer` in `src/core/catalog/behaviors.ts`, and `customDef` for hold-taps.
- **Resolving layer tokens:** `resolveLayerIndex(token, numericDefines(model))` in `src/core/keymap/layers.ts` handles `#define NAV 1`.
- **Combos:** `keymap.combos[].binding`, plus a combo's own `layers` (the layers it works on).
- **Conditional layers:** `src/core/keymap/conditional.ts` (if-layers → then-layer).
- **Encoders:** `sensorBindings` can hold layer behaviors too (rare).
- **Where to look:** `src/core/keymap/edit.ts` `remapLayers` already walks every layer reference, and is a good model for a `layerReferences(model)` core function.

**Suggested shape:**
- **Core, pure and tested:** `src/core/keymap/layerUsage.ts` with `layerReferences(model)` returning `{ from: layer | 'combo' | 'conditional', key?, behavior, to }[]`, plus `layerWarnings(model)`.
- **UI:** a component, with accessible names as the test contract. Clicking a reference selects that key on that layer (`selectLayer` + `selectKey`).

---

## 2. Display pins you can change

**Today:** `src/core/hardware/displays.ts` hard-codes the pins.
- The nice!view is on D1 (CS), D2 (data) and D3 (clock), through ZMK's adapter.
- OLEDs are on D2/D3, the Pro Micro I2C pins.
- The shield generator (`src/core/hardware/generate.ts`) writes `&pro_micro_i2c { … }` and uses ZMK's `nice_view_adapter`, which fixes the pins.

**Wanted:** choose the pins in the keyboard wizard, like key and encoder pins.

**Things to research first** (read ZMK v0.3 source, not memory):
- **I2C on nRF52840 Pro Micro boards:** the pins are chosen through pinctrl (`&pinctrl` nodes with `NRF_PSEL(TWIM_SDA, …)`) on `&pro_micro_i2c` (which is `&i2c0`). Custom pins mean generating `pinctrl-0`/`pinctrl-1` overrides with nRF pin numbers (P0.xx), not `&pro_micro` numbers. `PRO_MICRO_HEADER` in `src/core/hardware/controllers.ts` already maps D-pins to nRF52840 pins for the nice!nano.
- **nice!view without the adapter:** it's an SPI display. Generate our own `&spi` node with pinctrl and a `cs-gpios` entry, plus the `nice_view` shield's panel node, instead of using `nice_view_adapter`. Check `app/boards/shields/nice_view_adapter/*.overlay` in ZMK v0.3.
- **Conflicts:** the pin planner's conflict checks (`pinUses` in `src/core/hardware/wiring.ts`, issues in `validate.ts`) must include display pins, as they already do for the default pins.

**Model:** `KeyboardHardware.displays` becomes `{ left?: { kind, pins? } … }` or gets a separate `displayPins` field. Keep old definitions readable: `definition.ts` parses with versioning, currently `VERSION = 1`.

---

## 3. Other microcontrollers (Seeed XIAO first)

**Today:** the wizard only offers Pro Micro-footprint BLE boards.
- `HARDWARE_CONTROLLERS` in `src/core/hardware/controllers.ts` filters `CONTROLLER_DATA` to `exposes pro_micro && ble`.
- **Everything assumes `&pro_micro` pins:** the pin lists `PRO_MICRO_PINS`/`PRO_MICRO_HEADER`, generated `&pro_micro N` GPIO references, `requires: [pro_micro]` in the generated `.zmk.yml`, `&pro_micro_i2c`, and `ProMicroPinout.tsx`.

**The catalog already knows other interconnects** (`CONTROLLER_DATA` in `keyboards.data.ts`):
- `seeeduino_xiao_ble` and `xiao_ble` expose `seeed_xiao`; so do `seeeduino_xiao_rp2040` and `adafruit_qt_py_rp2040`.
- `blackpill_*` expose `blackpill`, and `nrf52840_m2` exposes `makerdiary_nrf52840_m2`.
- Start with the Seeed XIAO nRF52840 (BLE, very popular). ZMK's interconnect is `seeed_xiao`, with node labels like `&xiao_d` and `&xiao_i2c` / `&xiao_spi`. Confirm the names in `app/boards/seeeduino_xiao_ble/` and ZMK's interconnect docs.

**Refactor needed:** an `Interconnect` definition (header pads with labels, GPIO node label, I2C/SPI labels, pad count, power pads, and pin mapping for the pinout drawing). Then:
- **Wizard:** controllers are grouped by interconnect.
- **Generator:** writes `&<gpio label> N` and `requires: [<interconnect>]`.
- **Validation and pin planner:** use the interconnect's pins.
- **Pinout drawing:** from the interconnect.

The XIAO has only 11 GPIOs, so matrix sizes hit limits quickly. Validation should say so clearly (e.g. max 5×6 per half, or suggest direct wiring or shift registers, which are out of scope).

**Watch out:** generated shield files for existing designs must not change. Add a golden test on a Pro Micro design before refactoring.

---

## 4. A visual pin planner in the wizard

**Today:**
- `HardwareWiringStep.tsx` assigns row and column pins with selects, a pin-usage list and conflict messages. The user finds this very effective; keep it.
- `ProMicroPinout.tsx` draws a simple pinout.
- The layout step (`HardwareLayoutStep.tsx` + `DesignerCanvas.tsx`) sets each key's row and column.

**Wanted, as an optional view beside the current one:**
- **Board drawing:** a graphic of the actual microcontroller (per interconnect, so do #3's interconnect model first or together). Pads are coloured by what they're used for: row, column, encoder, display, free or power.
- **Drawing the matrix:** in the layout canvas, drag across keys to put them on a row or column (e.g. pick "Row 2", then paint keys). Row and column wires are drawn as lines through the keys, like a PCB wiring view.
- **Linking the two:** hover a pad to highlight its keys; click a pad to start assigning it.

**Design notes:**
- The matrix data already exists (`HardwareKey.row/col`, `wiring.rows/cols` pin lists).
- This is purely a new UI over the same model, so it needs no format changes. It is mostly SVG work in the style of `DesignerCanvas` and fits the design system (tokens, no raw colours).

---

## Suggested order

1. Layer-usage overview. Small, and the user asked for it first.
2. Other microcontrollers: introduce the interconnect model.
3. Display pins, which build on the interconnect's I2C/SPI definitions.
4. Visual pin planner, which draws the interconnect.

Each is its own PR from `main`.
