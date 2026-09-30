# ZMK Studio live mode: implementation plan

Spec: `docs/specs/2026-09-30-zmk-studio-design.md`. Built in-session. Every task writes its tests first. Run tests with `npx vitest run --maxWorkers=6`.

## Changes from the spec, found while planning

These are recorded in the spec's "Planning refinements" section too.

- **Reserved layers.** They're kept as `KeymapModel.reservedLayers?: DtNode[]`, printed at the end of the `keymap` node, instead of a `Layer.status` field. `model.layers` stays active layers only, so no UI code has to skip reserved ones. Their devicetree position after the real layers keeps real layer IDs equal to their indices.
- **Custom behaviors match by `display-name ?? node name`.** That's how ZMK names a behavior without `display-name` (`DEVICE_DT_NAME`), so the generator doesn't need to add anything.
- **Parameters translate cell by cell.**
  - The keyboard's parameter metadata gives each cell's kind: `hidUsage` means keycode, `layerId` means layer, anything else is a number.
  - Enum tokens (`BT_SEL`, `RGB_TOG`, `MB1`, `MOVE_UP`…) expand through a table taken from the ZMK v0.3 headers. For example, `BT_CLR` → `[0, 0]` and `BT_SEL` → `[3]`, followed by the next token.
- **Sync is a reconciler, not a before/after diff.** The session keeps a *mirror* of what's on the keyboard. After every editor change it works out the ops that take the mirror to the editor's desired state, sends them in order, and updates the mirror as each one succeeds. The same code handles live edits, undo, "Send my config to the keyboard" and retrying after an unlock.
- **Layer identity.** `Layer.uid?: number` is assigned by the reducer (`withLayerUids`) on load, commit, editConfig, undo and redo. The session maps `uid ↔ device layer id`, and the generator ignores `uid`.
- **Studio-only marker.** `ZmkConfig.studio?: { device: string }` means the config was read from a keyboard and has no repo. It's stored with the config, so a reload keeps it. Opening from GitHub or picking a keyboard replaces it.
- **Connecting from the top bar:**
  - The demo or a Studio-only config: load from the keyboard directly.
  - Any other config: compare. If the key count differs, the dialog offers "Edit the keyboard's own keymap instead" or Cancel.

## Tasks

### 1. Reserved layers in the model
- `model.ts`: `reservedLayers?: DtNode[]`.
- `importer.ts`: in the `keymap` container, a child with `status = "reserved"` goes to `reservedLayers` (no warning).
- `generator.ts`: print `reservedLayers` after the layers inside the `keymap` container (`printNode(node, 2)`).
- Tests: a round trip keeps `extra1 { status = "reserved"; };` at the end, and the layer count ignores it.

### 2. Layer uids
- `src/core/keymap/layerIds.ts`: `withLayerUids(model)` gives every layer without a `uid` a fresh one and returns the same object when nothing changed.
- The reducer applies it in `initialState`, `commit`, `editConfig`, and the `load` path.
- Tests: uids survive rename and move; `addLayer` gets a new uid; undo brings back the old uids; the generated text doesn't change.

### 3. Numeric HID usages for keycodes
- `scripts/gen-keycodes.mjs`:
  - Also fetch `hid_usage.h` and `hid_usage_pages.h`, and resolve `ZMK_HID_USAGE(page, id)` to `(page << 16) | id`.
  - Implicit `LS(...)` gets `0x02 << 24`.
  - Write `usage: number` in `KeycodeData`, then regenerate `keycodes.data.ts`.
- Tests: `A` = 0x070004, `EXCL` = 0x02070000 | 0x1E, `C_VOL_UP` = 0x0C00E9.

### 4. `src/core/studio/usage.ts`
- `encodeKey(token)` → number or undefined, using `parseKeyExpression`, with modifier functions as bits 24–31 per `modifiers.h`.
- `decodeKey(value)` → token: an exact keycode match first (so `EXCL` comes back as `EXCL`), otherwise `LS(...)` wrappers around the stripped key, with preferred names.
- Tests: round trips for `A`, `LS(A)`, `LC(LS(TAB))`, `EXCL`, `C_VOL_UP`; unknown → undefined.

### 5. `src/core/studio/enums.ts`
- Enum tokens → cells for `bt`, `out`, `rgb_ug`, `bl`, `ext_power`, `mkp`, `mmv`, `msc` (values from the v0.3 headers, checked 2026-09-30).
- Decoding picks the token whose cells match: two-cell tokens first, then one-cell tokens with the rest passed on.
- Tests: `BT_SEL 1` ↔ [3, 1]; `BT_CLR` ↔ [0, 0]; `MOVE_LEFT` ↔ 0xFDA80000; `MB2` ↔ 2.

### 6. `src/core/studio/behaviors.ts`
- `BUILTIN_DISPLAY_NAMES`: "Key Press" → `kp` and so on, including `mouse_move` → `mmv` and `mouse_scroll` → `msc`, which have no display-name.
- `DeviceBehavior = { id, name, cells: CellKind[] }`, where `CellKind` is `'keycode' | 'layer' | 'number' | 'none'`, taken from the metadata sets.
- `resolveBehaviors(device, keymap)` → `{ refById, idByRef }`. Custom behaviors match `display-name ?? node name`. Anything unmatched gets a synthetic ref (a slug of its name, made unique), recorded for Studio-only configs.
- Tests cover built-ins, a custom hold-tap matched by node name and by display-name, and an unknown behavior.

### 7. `src/core/studio/translate.ts`
- `toDevice(binding, ctx)` returns `{ ok: DeviceBinding }` or `{ reason }`.
  - Keycode cells go through `encodeKey`, layer cells through `resolveLayerIndex` and then uid → device id, numbers through `Number`, and enum tokens through the table.
  - Reasons: "not on the keyboard" (the behavior isn't in the firmware), "can't be sent live" (an unknown token), "layer not on the keyboard yet" (pending).
- `fromDevice(deviceBinding, ctx)` returns a `Binding` or `{ reason }`.
- Tests cover every param kind in both directions, plus the failure reasons.

### 8. `src/core/studio/reconcile.ts`
- `DeviceKeymap = { layers: { id, name, bindings: DeviceBinding[] }[], availableLayers }`.
- `reconcile(mirror, desired)` → ordered ops, in this order: remove the device layers not in desired, add layers (needs `availableLayers`, else "needs a build"), move to the desired order, rename, then set the bindings that differ.
- The desired state comes from `desiredKeymap(keymap, uidToId, behaviors)`. It returns the desired layers (uid, id if known, name, device bindings or skips) and a list of `needsBuild` keys and layers.
- Tests: set binding; rename; move; delete; add with and without a free slot; undo back to the mirror → no ops; a binding pointing at a just-added layer waits for the next pass.

### 9. `compare.ts` and `fromDevice.ts`
- `compareKeymaps(keymap, device, ctx)` → the differing keys `{ layer, key }[]` plus layer-structure differences, and the summary text "7 keys on 2 layers". Keys that can't be translated on either side don't count.
- `configFromDevice(info, keymap, layouts, behaviors)` → a `ZmkConfig`:
  - `studio: { device }`, a `keyboard` slug, `config.layout` from the active physical layout, and layers with uids.
  - Synthetic behaviors become `Behavior`s with `#binding-cells`, so the palette and labels work.
  - Default `kconfig`, `west` and `build` as for a picked keyboard.
- Tests use a fixture device keymap.

### 10. Enabling Studio in a repo config
- `src/core/studio/enable.ts`:
  - `studioEnabled(config)`: some target has the snippet and the cmake arg.
  - `enableStudio(config, spare)`: the central target is the one whose shield ends in `_left`, or the only one, and it gets the snippet and `-DCONFIG_ZMK_STUDIO=y` appended to any existing cmake-args. `spare` reserved layers `extra_1…` are added.
  - `disableStudio(config)`: removes both, plus reserved layers that have no bindings.
  - `hasUnlockKey(keymap)`.
- `&studio_unlock` goes into `BUILTIN_BEHAVIORS` (group `system`, keycap "Unlock"), with a palette tile under System.
- Tests: enable/disable round trips through `generateConfig`/`importConfig`; split versus unibody.

### 11. The device layer
- `npm i @zmkfirmware/zmk-studio-ts-client`.
- `src/ui/studio/device.ts`: the `StudioDevice` interface, plus error classes (`LockedError`, `DeviceGone`).
- `realDevice.ts`: `connectSerial()` wraps `transport/serial.connect`, `create_rpc_connection` and `call_rpc`, maps `meta.simpleError === UNLOCK_REQUIRED` to `LockedError`, and reads the notification stream.
- `fakeDevice.ts`: `createFakeDevice(opts)`, an in-memory keymap with lock simulation, `unlock()`, `pull()` to simulate unplugging, spare layers and behaviors. Used by tests and by `?studio=fake` (only in DEV).
- Tests: the fake's own behavior; the real one is checked with type tests only.

### 12. `src/ui/state/studioSession.ts`: `useStudioSession(state, dispatch)`
- **Status:** `idle | connecting | locked | loading | mismatch | connected | error`, with a generation guard like `useBuildSession`.
- **`connect()`:**
  1. Open the device, get its info and lock state.
  2. If it's locked, wait for `lockStateChanged`.
  3. Read the behaviors (list, then details for each), the keymap and the layouts.
  4. Decide: load it (demo or Studio-only config), mark it in sync, or show the mismatch.
- **The sync loop:** an effect on `state.config.keymap` marks the session dirty. A single async loop then works out `desired` from the latest keymap, reconciles it against the mirror, sends ops one at a time, and repeats while there's more to do. On `LockedError` it pauses in `locked` and resumes on unlock.
- **`save()`, `discard()`:** Discard reverts the keyboard, reloads its keymap, then `load`s (Studio-only config) or `edit`s (repo config, undoable).
- **`resolveMismatch('editor' | 'keyboard' | 'replace')`**, `disconnect()`.
- **Exposes** `unsaved` (from `unsavedChangesStatusChanged` and `checkUnsavedChanges`), `needsBuild`, and `deviceRefs` (for filtering the palette).
- Tests with the fake device and `renderHook`: every flow in the spec's Verification section.

### 13. The top-bar control and the welcome choice
- `StudioConnect.tsx`:
  - A pill button next to `KeyboardButton` with the status text.
  - Not Chromium (`!('serial' in navigator)`) → disabled, with a tooltip.
  - When connected, a small menu with Disconnect.
- `WelcomeDialog`: a fourth choice, "Connect a Studio keyboard", which calls `connect()`.
- App wiring: `useStudioSession` sits next to `useBuildSession`.

### 14. The save bar, the mismatch dialog, and warning before leaving
- `StudioSaveBar.tsx`: shown when `unsaved`, under the view tabs next to `.notice`. It has Discard and Save to keyboard.
- `StudioMismatchDialog.tsx`: the summary, a short list of up to 8 differing keys ("Layer Nav, key 12: A → B"), and the two or three choices.
- A `beforeunload` guard while `unsaved`.

### 15. Studio-only views, palette filtering, needs-build marks
- Studio-only config (`config.studio`):
  - Combos, Behaviors, Macros, Modules, Screens and Settings show a shared `StudioOnlyNote` with Open from GitHub, which goes to Build & flash.
  - Build & flash shows the same note above Connect.
  - LayerRail's Add is disabled when the device has no free layer.
- While connected, `KeyPalette` gets `available?: ReadonlySet<string>` and hides behavior tiles the keyboard doesn't have (Studio-only config only).
- `KeyboardCanvas`/`Keycap` get `flagged?: ReadonlySet<number>` for the current layer's needs-build keys: an amber corner dot, with the accessible description "Needs a build".

### 16. The Studio pane in Settings
- In `SettingsView`, a "ZMK Studio" nav entry and pane containing:
  - the switch "Change keys without rebuilding"
  - a spare-layers `NumberInput` (0–8, default 2)
  - a checklist: unlock key placed (**Place it** goes to the Keymap tab with the Studio Unlock tile armed), build options on the central half
  - a warning when the catalog keyboard lacks the `studio` feature
  - a note on the ZMK version
- Tests by role and name.

### 17. Help, the design page, finishing touches
- A Help section "ZMK Studio (live changes)": what it is, how to enable it, browsers, and the "a new flash keeps the old keymap" note.
- `/#design`: add the save bar and the connect pill.
- A production build plus a CSP check (protobufjs/minimal must not need `eval`).

### 18. Review and handover
- One fresh general-purpose agent reviews the whole branch. Fix what it finds.
- `npm run typecheck`, `npm run lint` (check the exit code), the full vitest run.
- Restart the `dev-5174` preview, walk through both flows with `?studio=fake`, take Playwright screenshots, and hand over.
