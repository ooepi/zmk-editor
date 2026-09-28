# Key palette: implementation plan

Spec: `docs/specs/2026-09-28-key-palette-design.md`. Write tests first at every step.

1. **Core.** `src/core/keymap/palette.ts` and `palette.test.ts`:
   - `applyPaletteItem`: kp, mt (replaces the tap), lt, sk, a no-keycode behavior → kp, a binding item.
   - `behaviorTiles`: one tile per layer, per enum option, and for custom behaviors.
   - `swapBindings` and `copyBinding` in `edit.ts`, including adding needed includes.
   - Export `paramOrder`. Move `CONTEXT_GROUPS` into `catalog/behaviors.ts` as `offeredIn(context, def)`.
2. **Reducer.** Add `placeOnKey`, `swapKeys` and `copyKey`, with tests in `editorReducer.test.ts`. Each is a single undo step and selects the target key.
3. **Canvas.** Add `onDropItem` and `onDropKey` props to `Keycap` and `KeyboardCanvas`:
   - Keys can be dragged, and accept drops, only when those props are passed.
   - A `drop-target` class highlights the key being dragged over.
4. **Palette.** `src/ui/components/KeyPalette.tsx`:
   - Keys and Behaviors tabs.
   - Tiles that can be dragged and clicked.
   - An armed state.
   - Modifier chips named so they can't be confused with the picker's.
5. **App wiring.**
   - A clicked tile goes on the selected key, or arms itself when no key is selected.
   - While a tile is armed, clicking keys places it.
   - Esc disarms.
   - Update the shortcut hint text.
6. **Tests and styles.** Add a UI test (`src/ui/KeyPalette.test.tsx`) that drives drag events with a mock `dataTransfer`. Add styles to `styles.css`.
7. **Verify.** Run `npm run typecheck`, `npm run lint` and `npm test`, then check by hand in the browser.
