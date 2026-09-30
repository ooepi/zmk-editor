# ZMK Studio live mode: design

## Context

ZMK Editor should cover every way of setting up a ZMK keyboard. ZMK Studio firmware lets you change key bindings and layers over USB at once, without the commit → build → flash cycle. There are two kinds of users:

- **Studio users**, who flashed Studio firmware once. They only want to read the keymap from the keyboard, change it and save it back, with no GitHub involved.
- **Repo users**, who keep their config in GitHub. They want Studio as a way to try key changes instantly, while the repo stays the source of truth.

Both are in v1 (the user approved this, along with the explicit Save bar, a mismatch dialog with a summary, and approach 1).

On approval: branch `feat/zmk-studio` from an updated `main`. Copy this plan into `docs/specs/zmk-studio.md` and `docs/plans/zmk-studio.md`, and commit it along with `docs/handoff-zmk-studio.md`.

## Research facts the design relies on (primary sources, 2026-09-30)

Sources: zmk.dev docs (features/studio, config/studio), zmkfirmware/zmk `app/src/studio/*.c`, and npm `@zmkfirmware/zmk-studio-ts-client@0.0.18` (MIT; depends on protobufjs and async-mutex).

- **Enable.** In the `build.yaml` entry, add `snippet: studio-rpc-usb-uart` and `cmake-args: -DCONFIG_ZMK_STUDIO=y`, on the central (left) half only. Studio is available in ZMK v0.1, v0.2 and v0.3.
- **Extra layers** come from `extraN { status = "reserved"; };` in the keymap. Studio can't add more layers than that.
- **Locking.** `&studio_unlock` must be on a key. Every keymap RPC needs the keyboard unlocked, reads included. Unlocked calls: device info, lock state, the behavior list. The keyboard locks again after 500 s idle and on disconnect.
- **Saving.** Edits take effect in RAM at once. `saveChanges` writes them to flash, and `discardChanges` reverts them. The keyboard sends a notification when unsaved changes appear or go.
- **Flashing after a Studio save.** A newly flashed `.keymap` is ignored until `core.resetSettings`.
- **Behaviors** reach the client only as a numeric id plus a `display-name`, with parameter metadata (nil, constant, range, hidUsage, layerId). Params are raw integers: HID usage with modifiers in the high byte, and layer *ids*.
- **Physical layout** from the device has the same shape as our `PhysicalKey` (`src/core/layouts/types.ts`).
- **Browsers.** Web Serial needs Chrome or Edge on desktop. Bluetooth isn't supported in v1.

## User experience

- **Connect control** in the top bar, next to `KeyboardButton` (`src/ui/App.tsx`).
  - States: Not connected → Connecting → "Press your unlock key" → Connected (or "Connected · 2 changes need a build") → error.
  - Outside Chromium it's disabled and says why.
- **Welcome dialog** gets a fourth choice, "Connect a Studio keyboard".
- **Studio-only session:**
  - Config is built from the device: its name, the active physical layout in `config.layout`, and its layers.
  - The Keymap tab works, and the palette lists only behaviors the keyboard has.
  - Combos, Behaviors, Settings, Modules and Screens show "Studio can't change this. Open your config from GitHub to edit it and build."
  - Build & flash offers Open from GitHub.
  - The session isn't restored on reload; you reconnect instead.
- **Save bar**, shown while the keyboard has unsaved changes: "Live on the keyboard, not saved yet · Discard · Save to keyboard". Closing the tab with unsaved changes asks first.
- **Repo session, Settings:** a new "ZMK Studio" section with the switch "Change keys without rebuilding".
  - Turning it on adds the snippet and cmake-args to the central target and adds N reserved layers (NumberInput, default 2).
  - A checklist item: "Put the unlock key on your keymap" with a **Place it** button.
  - A warning when the catalog keyboard lacks the `studio` feature flag.
  - Turning it off removes the build options and any empty reserved layers.
- **Repo session, connecting:** compare the keymaps.
  - Equal: connected.
  - Different: a dialog, "The keyboard's keymap differs from your config: 7 keys on 2 layers", with the differing keys listed. Choices: **Send my config to the keyboard** or **Bring the keyboard's keymap into the editor** (one undoable edit, which goes into the next commit).
  - This also covers the case where a new flash kept the old Studio keymap.
- **Live sync:** while connected, every key and layer edit is sent, including undo, redo and paste.
  - An edit the keyboard can't take, such as a behavior that isn't in the flashed firmware, stays in the editor, and the key gets a "needs a build" mark.
- **Discard:**
  - Studio-only session: the keyboard reverts, and the editor reloads from it.
  - Repo session: the keyboard reverts, and its saved keymap goes into the editor as one undoable edit.
- **Disconnect:** the editor keeps its state. Reconnecting runs the compare again.

## Architecture

### Pure core: `src/core/studio/` (unit-tested)

- `usage.ts`: keycode expression ↔ HID usage integer, i.e. (page << 16 | id) with modifier flags in bits 24–31. It reuses `parseKeyExpression` and `formatKeyExpression` from `src/core/catalog/keycodes.ts`.
- `behaviors.ts`: device behaviors {id, displayName, metadata} → editor behavior refs.
  - A built-in table maps ZMK display names to refs, generated from ZMK v0.3 `app/dts/behaviors/*.dtsi` by extending `scripts/gen-keycodes.mjs` or adding a sibling script.
  - Custom behaviors match by their `display-name` property.
  - Unknown behaviors get a synthetic ref labelled with the device name.
- `translate.ts`: device binding ↔ `Binding`, with layer id ↔ layer index. Returns `{ ok } | { reason }`; the reason drives the "needs a build" mark.
- `diff.ts`: `(prev: KeymapModel, next: KeymapModel, map) → StudioOp[]`. Ops: setBinding, addLayer (restore a reserved layer), removeLayer, moveLayer, renameLayer. Layers are matched by a transient `uid`.
- `fromDevice.ts`: device keymap + physical layouts + behaviors → `ZmkConfig` for a Studio-only session.
- `compare.ts`: editor keymap vs device keymap → a list of differing keys for the mismatch dialog.

### Model and config changes

- `src/core/keymap/model.ts`: `Layer.status?: 'reserved'` and a transient `Layer.uid?: number`.
  - The importer reads `status`, and the generator writes it.
  - `uid` is assigned on import and in `addLayer` (`src/core/keymap/edit.ts`), and the generator and diff views ignore it.
- `src/core/studio/enable.ts`: `studioEnabled(config)`, `enableStudio(config, spareLayers)`, `disableStudio(config)`.
  - These edit `config.build.include` (`src/core/files/build.ts` already supports `snippet` and `cmakeArgs`) and the reserved layers.
  - When Studio is on, the generator gives every custom behavior a `display-name` (its label) so it can be matched.
- `&studio_unlock` is added to the palette under System. It's already in the `RESERVED` list in `behaviorEdit.ts`, and it needs catalog metadata in `src/core/catalog/behaviors.ts`.
- `scripts/gen-keycodes.mjs` also saves each numeric usage id (resolving through `hid_usage.h`), and `keycodes.data.ts` is regenerated.

### Device layer: `src/ui/studio/device.ts`

- The `StudioDevice` interface: `info()`, `lockState()`, `getKeymap()`, `getPhysicalLayouts()`, `listBehaviors()`, `behaviorDetails(id)`, `setLayerBinding()`, layer ops, `save()`, `discard()`, `resetSettings()`, `onNotification(cb)`, `close()`.
- `realDevice.ts` wraps `@zmkfirmware/zmk-studio-ts-client` (`transport/serial.connect`, `create_rpc_connection`, `call_rpc`). New dependency.
- `fakeDevice.ts` is an in-memory keyboard with lock simulation, used by the tests and by the dev-only `?studio=fake` switch (behind `import.meta.env.DEV`).

### Session: `src/ui/state/studioSession.ts`, `useStudioSession()`

It follows the pattern of `useBuildSession()` in `src/ui/state/buildSession.ts` (held in `App`, with a generation guard).

- **State machine:** idle → connecting → locked → comparing → connected, plus error.
- **Queue:** one queue sends ops strictly in order.
  - It pauses while locked and resumes after `lockStateChanged` reports unlocked.
  - It watches `config.keymap` through an effect: each change runs `diff`, and the ops go into the queue.
- **State it exposes:** `status`, `unsaved`, `needsBuild` (per layer uid and key), and the `mismatch` payload.
- **Actions it exposes:** `connect`, `disconnect`, `save`, `discard`, `resolveMismatch('editor' | 'keyboard')`.
- **Loading from the keyboard:** the keyboard → editor direction dispatches `load` (Studio-only session) or `edit` (repo session, undoable).

### UI

- `src/ui/components/StudioConnect.tsx`: the top-bar control.
- `StudioSaveBar.tsx`, `StudioMismatchDialog.tsx`.
- A Studio section in `SettingsView.tsx`.
- A Studio choice in `WelcomeDialog` in `App.tsx`.
- A "needs a build" mark in `Keycap.tsx` / `KeyboardCanvas.tsx`.
- Palette filtering in `KeyPalette.tsx`.
- Studio-only notes on the other views.
- New shared pieces use the existing primitives (`Dialog`, `Switch`, `Section`, `Badge`, `NumberInput`) and go on the `/#design` page. Raw colours stay in `tokens.css`, and accessible names stay stable.
- Check the CSP in `vite.config.ts` against a production build with the real library (protobufjs/minimal must not need `eval`).

## Build order (tests alongside each step)

1. Model: `Layer.status` and `uid`, plus the importer, generator and edit changes; numeric usage ids in keycodes; the `&studio_unlock` palette item.
2. `enable.ts` and the Studio section in Settings (switch, spare layers, unlock checklist, catalog warning); `display-name` on custom behaviors.
3. Core studio files: `usage`, `behaviors` (plus the generated display-name table), `translate`, `diff`, `compare`, `fromDevice`.
4. The device interface, the fake device, and the real device (add the dependency).
5. `useStudioSession()`: connecting, locking, the queue, notifications, compare/mismatch, save and discard.
6. UI: the connect control, the welcome choice, the save bar, the mismatch dialog, Studio-only view notes and palette filter, needs-build marks, beforeunload, and the `/#design` entries.
7. One fresh whole-branch review by a general-purpose agent. Fix what it finds, restart the preview (`dev-5174`), and hand over to try.

## Verification

- `npx vitest run --maxWorkers=6`, `npm run typecheck`, `npm run lint` (check the exit code).
- Unit tests: usage round trips (including `LS(A)` and consumer keys), behavior mapping, translate both ways, the diff for set, add, remove, move and rename plus undo, `compare`, `fromDevice`, `enable`/`disable` round trips through `generateConfig`/`importConfig`.
- Session tests with the fake device: the locked → unlock flow, ordered queue, idle relock pause and resume, mismatch both ways, save, discard (repo discard is undoable), a rejected binding → needs build, cable pull → disconnected with state kept.
- UI tests by role and name for the connect control, save bar, mismatch dialog, Settings switch, welcome choice and Studio-only notes.
- Preview: `?studio=fake` on `dev-5174`. Walk through the Studio-only and repo flows, and take screenshots with a scratch Playwright script.
- `npm run build`, then check the CSP by loading the production preview.
- Real hardware: only the user can test this, after flashing a Studio build (the Settings switch → Build & flash → connect).

## Deferred (not in v1)

Bluetooth transport; selecting a physical layout; encoder bindings; "Restore stock settings" as its own button (the mismatch dialog covers it); turning a Studio-only session into a new GitHub config; exporting a `.keymap`.

## Planning refinements (2026-09-30)

Found while reading the code for the plan (`docs/plans/2026-09-30-zmk-studio.md`). Where these differ from the sections above, these win.

- **Reserved layers** are stored as `KeymapModel.reservedLayers` (devicetree nodes printed after the real layers), not as a `Layer.status` field.
- **Custom behaviors** match the keyboard's behaviors by `display-name`, or by node name when there is none (ZMK's own fallback). The generator doesn't change.
- **Parameters** translate cell by cell, using the keyboard's parameter metadata plus an enum table taken from the ZMK v0.3 headers.
- **Sync** is a reconciler. The session keeps a mirror of the keyboard's keymap and sends the ops that take it to the editor's state. Layers are matched by a transient `Layer.uid`.
- **Studio-only configs** are marked with `ZmkConfig.studio = { device }`.
- **Connecting from the top bar** with the demo or a Studio-only config loads from the keyboard. With any other config it compares. When the key count differs, it offers "Edit the keyboard's own keymap instead".
