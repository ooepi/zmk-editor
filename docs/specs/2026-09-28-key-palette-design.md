# Key palette: drag & drop and click-to-place

## Why

Changing a key means: click the key → side panel → behavior select → open the keycode picker → search or filter → click. It works, but it is slow for the most common job, "put X on this key". VIA-style editors lay every key out under the keyboard and let you drag one onto a key. This adds that, plus moving bindings between keys, which the editor could not do at all.

## Decisions

- A **palette** sits under the keyboard in the Keymap view. It has two tabs:
  - **Keys:** search box, category chips and "hold with" modifier chips, the same filters as the keycode picker.
  - **Behaviors:** layers, Bluetooth, mouse, lighting, system, your behaviors and macros, and module behaviors, each expanded into ready-made tiles.
  - **Transparent** and **None** tiles are always shown.
- **Dropping a keycode keeps the key's behavior** and replaces its tap keycode:
  - `&mt LSHIFT A` + `B` → `&mt LSHIFT B`.
  - `&lt 1 A` + `B` → `&lt 1 B`.
  - `&sk LSHIFT` + `B` → `&sk B`.
  - A key whose behavior has no keycode param becomes `&kp B`.
  - Dropping a behavior tile replaces the whole binding.
- **Key → key drag swaps** the two bindings. Holding **Alt or Ctrl** while dropping **copies** instead. This only works within the shown layer.
- **Click to place:**
  - With a key selected, clicking a tile puts it on that key, and the key stays selected.
  - With no key selected, clicking a tile **arms** it. Each key you then click gets the tile. Esc, or clicking the tile again, disarms it.
  - This also covers touch screens, where HTML drag and drop does not work.
- After a drop the target key is selected, so the side panel can fine-tune it, for example to change the hold modifier.
- Every placement is one undo step.

## Design

### Core (`src/core/keymap/palette.ts`)

- `PaletteItem`: either `{ kind: 'keycode'; token }` or `{ kind: 'binding'; binding }`.
- `applyPaletteItem(current, item, model): Binding` applies the rule above. The tap-first param order is shared with `changeBehavior`.
- `behaviorTiles(model): BehaviorTile[]` builds tiles from the behavior catalog for the `key` context:
  - Layer behaviors get one tile per layer.
  - Enum behaviors get one tile per option.
  - Any other behavior gets one tile with default params.
  - Tile labels come from `describeBinding`.
- `swapBindings` and `copyBinding` go in `edit.ts`.
- The per-context behavior filter moves from `BindingEditor` into the catalog, so the palette and the editor offer the same behaviors.

### State

The editor reducer gets three new actions:
- `placeOnKey { index, item }`
- `swapKeys { from, to }`
- `copyKey { from, to }`

All three act on the current layer, select the target key and commit to history.

### UI

- `KeyPalette` component, shown in the Keymap view only.
- `KeyboardCanvas` and `Keycap` get optional drop handlers. Keys can only be dragged, and only accept drops, when those handlers are passed, so the Combos view is unchanged.
  - Drag data uses the custom types `application/x-zmk-palette` (a JSON `PaletteItem`) and `application/x-zmk-key` (a key index).
  - The key under the pointer is highlighted while dragging.
- The armed tile lives in `App`. While a tile is armed, a key click places the tile instead of selecting the key.

## Out of scope

Encoder drops, dragging across layers, recently used or favorite keys, selecting several keys, and clipboard copy/paste.
