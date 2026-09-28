# Multi-select, copy/paste and cross-layer drag: implementation plan

Spec: `docs/specs/2026-09-28-multi-select-clipboard-design.md`. Write tests first at every step.

1. **Core.** `clipboard.ts` with `copyKeys` and `pasteKeys`, plus tests. Give `copyBinding` a source layer.
2. **Reducer.**
   - Add `selection` and `clipboard` to the state, with a `select()` helper so `key` and `selection` always agree.
   - Add the actions `toggleKey`, `selectKeys`, `placeOnSelection`, `copyKeys`, `cutKeys` and `pasteKeys`, and `copyKey.fromLayer`.
   - Add tests.
3. **Canvas.**
   - `Keycap.onSelect` gets an additive flag for Ctrl/Shift clicks.
   - Key drag data carries `{ layer, index }`.
   - `KeyboardCanvas` takes a `selection` prop and draws the selection box, reporting it through `onSelectBox`.
4. **Layer bar.** Hovering a tab during a drag switches layer after 500 ms.
5. **Panels.** A `SelectionPanel` for several keys. Copy, Cut and Paste buttons (`ClipboardButtons`) in both panels.
6. **App wiring.**
   - Ctrl+C / X / V / A shortcuts.
   - Delete acts on the whole selection.
   - A palette click places the tile on the whole selection.
   - Drops across layers copy.
7. **Tests and styles.** UI tests in `src/ui/MultiSelect.test.tsx`, plus styles.
8. **Verify.** Run typecheck, lint and tests, then check in the browser.
