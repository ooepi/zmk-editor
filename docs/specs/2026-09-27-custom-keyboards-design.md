# Custom keyboards — design spec

Status: design approved in conversation (2026-09-27). This spec needs the owner's review. After that, each stage gets its own implementation plan in `docs/plans/`.

## Why

Today every config starts from a keyboard in the catalog. The layout designer only moves keys around, and its result goes to `config/info.json`, which is visual only. Someone who hand-wires a board or designs their own PCB can't describe the *hardware*: the controller, the matrix, the pins, the diodes, and whether it's split. ZMK needs all of that as a **shield** in the user's `zmk-config` repo, under `config/boards/shields/<name>/`.

This feature lets any editor user create a new keyboard from scratch, and change it later. The editor generates:
- the shield files;
- a starter keymap;
- the `build.yaml` entries.

GitHub Actions then builds real firmware from them, like it does for catalog keyboards.

## Product decisions

- **Audience:** any editor user, so beginners too. That means:
  - a clickable pinout diagram;
  - plain-language help;
  - validation that blocks broken keyboards before they're committed.
- **Wiring:** a diode matrix (`col2row` or `row2col`), or direct wiring (one pin per key).
- **Controller:** the Pro Micro footprint with an nRF52840: nice!nano v2 and compatible boards. Pins use the `&pro_micro` names. Other controllers come later.
- **Split keyboards:** both halves use the same pins by default. A "right half is wired differently" switch unlocks a second pin table.
- **Keys and matrix positions:** the wizard starts from a rows × columns grid, so every key already has a row and a column. The user moves and deletes keys in the layout designer, and can change any key's row/column. Clashes are flagged.
- **Re-editing:** the keyboard stays editable. Its definition is saved as JSON next to the shield files, and the shield files are regenerated from it. If the shield files in the repo were edited by hand, the editor warns before overwriting them.
- **Where it goes:** the new keyboard replaces the open config, the same way "Start a new config" does. Creating a new GitHub repository is out of scope.
- **Names:** lowercase `[a-z0-9_]`, starting with a letter. A name must not clash with a ZMK built-in shield. The keyboard name (`ZMK_KEYBOARD_NAME`, also the Bluetooth name) is at most 16 characters.
- **ZMK versions:** all versions the editor supports (v0.1–v0.3). Every piece the generated files rely on exists in all three (see *Verified facts*).

## Verified facts (checked against `zmkfirmware/zmk` at tag `v0.3`)

- **Pro Micro pins:** `app/boards/arm/nice_nano/arduino_pro_micro_pins.dtsi` maps `&pro_micro` pins 0–10, 14, 15, 16 and 18–21 (18 pins).
  - Pins 11–13 and 17 don't exist.
  - The file also defines `pro_micro_i2c: &i2c0`, `pro_micro_spi: &spi1` and `pro_micro_a` (analog numbering). Stage 3 will need these.
- **Shield layout,** from `app/boards/shields/corne/`:
  - `Kconfig.shield`: one `config SHIELD_<NAME>_<SIDE>` / `def_bool $(shields_list_contains,<name>_<side>)` per half.
  - `Kconfig.defconfig`:
    - `if SHIELD_<NAME>_LEFT` sets `ZMK_KEYBOARD_NAME` and `ZMK_SPLIT_ROLE_CENTRAL`;
    - `if` either half sets `ZMK_SPLIT`.
  - `<name>.dtsi` holds the `chosen` node (`zmk,kscan`, `zmk,physical-layout`), the `zmk,matrix-transform` (`rows`, `columns`, `map = <RC(r,c) …>`) and the `zmk,kscan-gpio-matrix` node:
    - `diode-direction = "col2row"`;
    - `row-gpios` with `(GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)`;
    - `wakeup-source`.
    - The physical layout's `transform = <&…>` points at the matrix transform.
  - `<name>_left.overlay` / `<name>_right.overlay` include the `.dtsi` and set `col-gpios` (`GPIO_ACTIVE_HIGH`). The right half sets `col-offset` on the transform.
  - `<name>.zmk.yml`: `file_format`, `id`, `name`, `type: shield`, `requires: [pro_micro]`, `features: [keys]`, `siblings`.
- **Physical layouts:** `app/dts/physical_layouts.dtsi` exists at v0.1, v0.2 and v0.3.

Facts still to check against the ZMK sources in each stage's plan, before any code is written:
- the direct-wiring kscan (`zmk,kscan-gpio-direct`, `input-gpios` and its flags);
- the `row2col` pull direction;
- the encoder and display/lighting nodes.

## Architecture

The **hardware definition is the source of truth**, and the shield files are generated from it. This is the same pattern as `KeymapModel` → `.keymap` and `PhysicalLayout` → `info.json`.

We don't parse hand-written overlays back into a model. A round trip through arbitrary devicetree is fragile, and nothing needs it.

### Core: `src/core/hardware/` (no React)

**`types.ts` — `KeyboardHardware`**

```ts
type Pin = number;                        // &pro_micro pin number
interface HardwareKey extends PhysicalKey // x, y, w, h, r, rx, ry (1/100 key units)
  { row: number; col: number; side?: 'left' | 'right' }
type Wiring =
  | { kind: 'matrix'; diodeDirection: 'col2row' | 'row2col';
      rows: Pin[]; cols: Pin[]; right?: { rows: Pin[]; cols: Pin[] } }
  | { kind: 'direct'; pins: Pin[]; right?: Pin[] };
interface KeyboardHardware {
  name: string; displayName: string; controller: string; // e.g. 'nice_nano_v2'
  split: boolean; wiring: Wiring; keys: HardwareKey[];
  encoders?: EncoderDef[];     // stage 2
  peripherals?: Peripherals;   // stage 3
}
```

`keys` holds both the physical position and the matrix position, so the layout and the wiring can't drift apart. Missing `right` means the right half is wired like the left. For direct wiring, key `n` on a half uses `pins[n]`, and its matrix position is `RC(0, n)`, plus the column offset on the right half.

**`controllers.ts`**
- The Pro Micro pinout: pin numbers, header labels (D0, D1, …) and positions on the board for the diagram.
- The nRF52840 boards with a Pro Micro footprint, taken from `CONTROLLER_DATA` in `src/core/catalog/keyboards.data.ts` (entries that expose `pro_micro` and have `ble`).

**`validate.ts` — `validateHardware(hw): { errors, warnings }`**
- **Errors** (these block "Create" and the commit):
  - a pin used twice on the same half;
  - a pin that isn't on the header;
  - a row or column with no pin;
  - two keys on the same half with the same row/column;
  - a key whose row/column is outside the matrix;
  - more pins than the header has;
  - an invalid name, a name that clashes with a catalog shield, or a keyboard name longer than 16 characters.
- **Warnings:**
  - a row or column that no key uses;
  - a split whose halves have no keys on one side.

**`generate.ts` — `generateShield(hw): Record<path, text>`**, deterministic, all under `config/boards/shields/<name>/`:
- `Kconfig.shield` and `Kconfig.defconfig`. For a unibody board: a single `SHIELD_<NAME>` and the keyboard name. For a split: the Corne pattern above.
- `<name>.dtsi` for a split, or `<name>.overlay` for a unibody board, holding:
  - `chosen`;
  - the kscan node;
  - the matrix transform, column-aligned like the Corne, with an ASCII comment of the key grid;
  - the physical layout, reusing `layoutDtsi` from `src/core/layouts/dtsi.ts` and adding the `transform` reference.
- `<name>_left.overlay` / `<name>_right.overlay` for splits: `#include "<name>.dtsi"`, the half's pins, and `col-offset` on the right half.
- `<name>.zmk.yml`.
- `<name>.editor.json`: the `KeyboardHardware` itself, pretty-printed.

The nodes are built with the devicetree AST and `printNode` from `src/core/dts/printer.ts`. The document-level `printTopLevel` / `printTopLevelItem` move out of `src/core/keymap/generator.ts` into `src/core/dts/`, so the keymap generator and the shield generator share them.

**`starter.ts` — `starterKeymap(hw): KeymapModel`**
- One layer.
- `&kp` in a QWERTY-like order by rows where the keys fit, and `&trans` everywhere else.

**`keys.ts` — `remapKeyPositions(model, oldToNew)`**
- Used when a hardware edit adds, removes or reorders keys.
- It rewrites every layer's bindings, filling new keys with `&trans`.
- It rewrites every combo's `key-positions`. A combo that loses a key gets a notice, and is dropped if it's left with fewer than two keys.
- Sensor bindings are untouched, because they follow encoders, not keys.

### Config integration

**`ZmkConfig`** (`src/core/config.ts`) gets `hardware?: KeyboardHardware`. Undo, redo and localStorage persistence work automatically, because they already cover the whole config.

**`generateConfig`**
- Adds the `generateShield` files when `hardware` is set.
- For custom keyboards the physical layout comes from `hardware.keys`, and `info.json` isn't written. `physicalLayoutFor` / `textLayoutFor` use the hardware layout first.

**`importConfig`**
- Reads `config/boards/shields/<kb>/<kb>.editor.json` when it's present.
- It then regenerates the shield files and compares them with the repo. If they differ, it adds a warning that the shield files were changed outside the editor. The Build tab then asks for confirmation before a commit overwrites them.

**`build.yaml`**
- A split board gets one target per half: `board: <controller>` with `shield: <name>_left` / `<name>_right`.
- A unibody board gets a single target.
- The existing `setModuleShield` (e.g. nice!view) keeps working on these targets.

**GitHub and files**
- `isConfigFile` in `src/ui/components/ConnectSection.tsx` also loads `config/boards/shields/**`.
- `filesToConfig` ("Open files") accepts the definition JSON.
- Zip export and commit already work from `generateConfig`, so they need no change.

### UI

**Entry point:** a "Design your own keyboard" card next to "Start a new config" in `KeyboardView`. It opens a new `View`, `'newKeyboard'`, in `App.tsx`.

**The wizard** has four steps, and each step validates before "Next":
1. **Basics:** display name (the id is derived from it and can be edited), split or not, controller, rows and columns (per half for a split), matrix or direct wiring.
2. **Wiring:**
   - The diode direction, with a small picture of which way the diode points.
   - Row and column pin tables (or one pin per key for direct wiring).
   - A clickable Pro Micro pinout. Pins that are already used are greyed out.
   - For a split, the "right half is wired differently" switch.
3. **Layout:** the existing `LayoutDesigner`. For custom hardware only, it gains:
   - add key and delete key;
   - a row/column field for the selected key;
   - a side (left/right) for splits;
   - highlighting for keys with clashing positions.
4. **Review:**
   - the validation summary;
   - a read-only preview of every generated file;
   - "Create", which dispatches `load` with a new `ZmkConfig` that has `hardware`, a starter keymap, a `.conf`, `west.yml` pinned to the chosen ZMK version, and the build targets.

**Re-editing:** for a keyboard that has `hardware`, the "This config" section of `KeyboardView` gets an "Edit hardware" button.
- It reopens the wizard on the current definition.
- Saving goes through `editConfig`, so it's undoable, with `remapKeyPositions` applied when keys changed.

**Conventions:** form fields follow the handoff rules, `<label htmlFor>` plus `aria-describedby`. `src/core` doesn't import React.

## Stages

Each stage gets its own plan in `docs/plans/`, its own PR, and a real firmware build in CI.

1. **Core and wizard:**
   - matrix and direct wiring;
   - split and unibody boards;
   - nRF52840 Pro Micro controllers;
   - the key remap;
   - import, commit and re-editing.
2. **Encoders:**
   - EC11 A/B pins per half, generated as `alps,ec11` nodes plus the `zmk,keymap-sensors` node.
   - The pin picker reserves encoder pins.
   - The existing `EncoderPanel` then works on custom keyboards unchanged.
3. **Displays and lighting:**
   - nice!view, through the existing `nice_view_adapter` shield;
   - SSD1306 OLED on `&pro_micro_i2c`;
   - RGB underglow (WS2812 over SPI, with nRF pinctrl);
   - PWM backlight.

   These reserve pins, and they depend most on the ZMK version, so every node is checked against ZMK sources before it's built.

## Verification

- **Unit tests, written first:**
  - `generateShield` output for two fixtures, a unibody direct-wired macropad and a split 3×6+3 matrix board. They are saved with `toMatchFileSnapshot` as full configs in `test/generated/<fixture>/`.
  - Validator cases for every error and warning.
  - `remapKeyPositions` on layers and combos.
  - Import → generate → import is stable for a config with `hardware`.
- **A real firmware build:** `.github/workflows/firmware.yml` hard-codes `CONFIG_DIR=test/generated/lily58` today. It becomes a matrix over the generated fixture directories, so ZMK itself builds the custom shields. This is the main proof that the generated files are correct.
- **UI tests** (`src/ui/NewKeyboard.test.tsx`):
  - go through the wizard, create the keyboard, and check that the generated files include the shield;
  - edit the hardware, delete a key, and check that the keymap and a combo are remapped.
- **Before each PR:** `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`.
- **End to end, by hand:**
  1. Create a keyboard in `npm run dev`.
  2. Commit it to a test branch of a zmk-config repo.
  3. The Actions build produces a `.uf2` for each half.

## Out of scope

- Other controllers: RP2040, XIAO, a bare nRF52840.
- Charlieplex and demux wiring.
- Creating GitHub repositories.
- Importing shields that weren't made by the editor. They keep working as plain files, but can't be edited in the wizard.
- PCB or case design.
