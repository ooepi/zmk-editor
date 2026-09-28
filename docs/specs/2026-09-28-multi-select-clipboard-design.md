# Multi-select, copy/paste and cross-layer drag

## Why

Building a layer from another one still means editing one key at a time. The editor also can't select several keys at once, copy keys between layers, or drag a key onto another layer. This builds on the key palette (`2026-09-28-key-palette-design.md`).

## Decisions

### Selecting
- A plain click selects one key, as before.
- **Ctrl+click or Shift+click** adds a key to the selection, or removes it.
- **Dragging a box** on empty space inside the keyboard selects every key it touches. Rotated keys use their rotated outline (`keysInBox`). Holding Ctrl or Shift while dragging the box adds to the selection instead of replacing it.
- A click on empty space clears the selection.
- **Ctrl+A** selects all keys. **Esc** clears the selection.
- The selection stays when you switch layers.

### Several keys selected
- The side panel shows how many keys are selected, with Copy, Cut, Paste, Transparent and None buttons. The binding editor only appears when exactly one key is selected.
- Clicking a palette tile places it on every selected key. Each key follows the drop rule, so a hold-tap keeps its hold and only the tap key changes.
- **Delete** makes every selected key transparent.
- Each of these is one undo step.

### Copy and paste
- **Ctrl+C** copies the selected keys: their bindings, positions and layer. **Ctrl+X** copies them and then makes them transparent.
- **Ctrl+V** pastes:
  - **One copied key** goes onto every selected key.
  - **Several copied keys** go into the same positions on the current layer.
- A paste that would change nothing shows a note instead:
  - several keys pasted onto the layer they came from, or
  - one key pasted with no key selected.
- The clipboard lives inside the editor, not in the system clipboard.
- Every paste is one undo step.
- Ctrl+C and Ctrl+V are left alone while typing in a text field. With no key selected, Ctrl+C is also left alone, so page text can still be copied.

### Dragging across layers
- While dragging a key or a palette tile, holding it over a layer tab for about half a second switches to that layer.
- A key dropped on a different layer from the one it came from is **copied**, and the original stays. On the same layer, keys swap as before, and holding Alt or Ctrl copies.

## Design

### Core
`src/core/keymap/clipboard.ts`:
- `KeyClipboard` holds `{ layer, keys: { index, binding }[] }`.
- `copyKeys(model, layer, indices)` builds a clipboard from the selected keys.
- `pasteKeys(model, layer, clip, selection)` returns the new model, or `null` when nothing would change.

`copyBinding` in `edit.ts` gets an optional source layer.

### State
- `EditorState.selection: number[]` lists every selected key. `key` stays the single edited key: it is set only when exactly one key is selected. Every selection change goes through one helper, so the two always agree.
- `EditorState.clipboard: KeyClipboard | null`. The clipboard is not part of undo history.
- New actions:
  - `toggleKey`: add or remove one key.
  - `selectKeys`: set the selection to a list of keys, or add them to it.
  - `placeOnSelection`: put one palette item on every selected key.
  - `copyKeys`, `cutKeys`, `pasteKeys`.
- `copyKey` gets an optional `fromLayer`.

### UI
- Key drag data includes the source layer.
- `KeyboardCanvas` draws the selection box (pointer events on the empty keyboard area) and marks every selected key.
- `LayerBar` tabs switch layer after about 500 ms of hovering during a drag.
- New `SelectionPanel` for several keys. Copy, Cut and Paste buttons also appear in the single-key panel, so they are easy to discover.

## Out of scope

Dragging several keys at once, the system clipboard, and multi-select in the Combos view.
