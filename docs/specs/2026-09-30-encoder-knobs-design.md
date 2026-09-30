# Encoder knobs on the keyboard: design

## Context

The Keymap tab shows encoders as a strip under the keyboard, with no idea of which half they belong to or where they sit. The user wants to see them on the correct half of a split keyboard, and to edit their positions in the layout editors. This only changes how the editor draws the keyboard: ZMK has no encoder positions, so firmware and keymaps are unchanged.

Approved in chat on 2026-09-30: draw the knobs on the keyboard, default each one under its own half, and make positions editable in the layout designer and the wizard's layout step.

## What the user sees

- **Keymap tab:** each encoder is a round knob drawn inside the keyboard, at its position.
  - It zooms and pans with the keys (the camera).
  - The left half of the knob shows the ↺ binding and the right half the ↻ binding. You can drop palette tiles on either half, and a click selects the encoder for the Encoder panel, as before.
  - The accessible name stays `Encoder N: ccw / cw`. The knobs sit in a group named "Encoders".
  - The old strip under the keyboard goes away.
- **Default position** (nothing saved): under its own half.
  - The left half's encoders sit centred under the left keys, and the right half's under the right keys.
  - Several encoders on one half sit side by side, 1.25u apart.
  - One-piece keyboards, and encoders whose half isn't known, sit centred under all the keys.
- **Layout designer** (catalog keyboards): the knobs are there too. Drag them, or select one and type X/Y (in key units). **Save** writes them to `config/info.json` along with the keys.
- **Wizard, layout step** (designed keyboards): the same. The positions are saved in the keyboard definition (`encoderSpots`).

## Model

- `PhysicalLayout.encoders?: (EncoderSpot | null)[]`, with `EncoderSpot = { x: number; y: number }`.
  - Each entry is the knob's centre, in 1/100 key units.
  - Entries are indexed by sensor, the same order as `sensor-bindings`.
  - `null` or a missing entry means the default position.
- **Which half each sensor is on,** `encoderSides(config): (Side | undefined)[]`:
  - Designed keyboards: `sensorOrder(hw)`.
  - Catalog keyboards: a new generated `encoders: ('left' | 'right' | null)[]` field per keyboard. `scripts/gen-keyboards.ts` reads the `zmk,keymap-sensors` node's `sensors = <&…>` labels, and a label containing `left` or `right` gives the half.
  - Anything else: undefined.
- **Placement,** `placeEncoders(layout, sides, count): EncoderSpot[]`, is pure and fills in the defaults.
  - A half's keys are designed-keyboard keys with that `side`. Otherwise the keys are split at the widest horizontal gap, and if there is no clear gap, at the middle.
- **Room on the canvas:** `layoutExtent` includes the knobs (as 1u squares) so they aren't clipped.
- **`info.json`:** a top-level `"zmk_editor": { "encoders": [{ "x", "y" } | null] }` in key units. QMK tools ignore unknown keys. Parsing reads it back, and it is written only when positions exist.
- **Designed keyboards:** `KeyboardHardware.encoderSpots?: (EncoderSpot | null)[]`, in `sensorOrder`.
  - `hardwareLayout(hw)` passes them on.
  - When the wizard adds or removes encoders, the spots move with them, using the same origin remapping (`carryEncoderOrigins`) that keeps sensor bindings.
  - `definition.ts` reads and writes them.

## Out of scope

- Moving an encoder to the other half (that's wiring).
- Knob size and rotation.
- Showing knobs in Print or on the Combos tab.
- The EC11 push button (it's a normal key).
