# Encoder knobs: plan

Spec: `docs/specs/2026-09-30-encoder-knobs-design.md`. TDD for each step. Run tests with `npx vitest run --maxWorkers=6`.

1. **Model and placement.**
   - Add `EncoderSpot` and `PhysicalLayout.encoders`.
   - `placeEncoders(layout, sides, count)`: halves by `side` or by the widest gap, then defaults under each half.
   - Make `layoutExtent` include encoders.
   - Tests: split halves, unibody, unknown half, saved spots kept.
2. **`info.json`.** Read and write `zmk_editor.encoders`. Tests: a round trip, and that it's left out when empty.
3. **Encoder halves.**
   - `scripts/gen-keyboards.ts` records the halves from the sensors labels. Regenerate `keyboards.data.ts` from a ZMK v0.3 checkout.
   - Add `encoderSides(config)`.
   - Tests: Lily58 is `[left]`, Sofle is `[left, right]`, a designed split follows `sensorOrder`.
4. **Designed keyboards.**
   - `hw.encoderSpots` in `definition.ts` (read and write).
   - `hardwareLayout` passes them on.
   - The wizard's add/remove encoder carries spots with the origins.
   - Tests: a round trip, and remapping on add and remove.
5. **Keymap tab.**
   - `KeyboardCanvas` draws the knobs (an `EncoderKnob` built from `EncoderStrip`'s buttons and drop zones) at the placed positions, in an "Encoders" group.
   - `App` stops rendering the strip.
   - Existing encoder tests keep their names. New test: the knobs sit inside the keyboard, and dropping on one works.
6. **Designers.**
   - `DesignerCanvas` shows the knobs. They can be selected and dragged (snapped to 0.25u), and moved with the arrow keys.
   - X/Y fields for a selected knob.
   - `LayoutDesigner` saves them in `config.layout`; `HardwareLayoutStep` in `hw.encoderSpots`.
   - Tests: drag or type a position, then save.
7. **Finish.**
   - Check the CSS against the design rules.
   - One fresh whole-branch review. Restart the preview and hand over.
