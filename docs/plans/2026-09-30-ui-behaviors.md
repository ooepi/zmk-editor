# UI overhaul, Phase 4 (behaviors and macros): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Behaviors and Macros pages stop being a list of buttons plus a form:
- The list is grouped by kind, colour-coded, with a one-line summary per item.
- One **New behavior** button opens a dialog of type cards that explain each kind.
- Each kind's editor is a small diagram (a keycap with Tap/Hold arms, a timing strip, a knob…), with the rarely-used settings under **Advanced timing**.

**Architecture:**
- **Summaries** (core). `behaviorSummary(behavior, model)` in a new `src/core/keymap/behaviorSummary.ts` returns the one-line text for the list.
- **Primitives.** `ui/Dialog.tsx` (native `<dialog>` + `showModal()`, jsdom polyfill in the test setup) and `ui/Switch.tsx`. Both go on the `/#design` page.
- **Split `BehaviorsView.tsx`** into `behaviors/BehaviorList.tsx`, `behaviors/NewBehaviorDialog.tsx`, `behaviors/BehaviorEditor.tsx` and one diagram per kind: `HoldTapDiagram`, `ModMorphDiagram`, `TapDanceDiagram`, `EncoderDiagram`. `BehaviorsView` stays as the page that wires them.
- **`PropertyFields`** gains an optional `only`/`except` list of property names, so a diagram can own some properties and "Advanced timing" shows the rest. Booleans render as `Switch`.
- **"Use it on a key"** jumps to the Keymap tab with the palette scrolled to "Your behaviors": `App` passes the palette a `jumpTo` request (section id + counter), which `KeyPalette` handles with its existing `jump()`.
- **Styles** in a new `styles/behaviors.css`, using the existing `--kind-*` tokens. `MacroSteps` and the module editors only get restyled.

**Tech Stack:** React 19, vitest + testing-library (jsdom).

**Spec:** `docs/specs/2026-09-29-ui-overhaul-design.md`, "Phase 4: Behaviors and macros". Branch `ui/behaviors` from `main`.

## Global Constraints

- Nothing in the generated `.keymap` changes for behaviors you don't touch.
- Keep the accessible names `+ Hold-tap`, `+ Mod-morph`, `+ Encoder behavior`, `+ Tap-dance` (now inside the dialog), `+ New macro`, the lists `Behaviors`/`Macros`, `Move N taps up/down`, `Remove N taps`, and the property labels. Tests only gain a "New behavior" click first; `scripts/screenshots.ts` too.
- Hold-tap bindings are behavior references without params (`<&kp>, <&mo>`), so its Tap/Hold arms stay behavior selects, not `BindingEditor`s.
- Tokens only; `tokens.test.ts` and `contrast.test.ts` stay green.
- Test runs use `npx vitest run --maxWorkers=6`. Restart the preview server before handing it over.

## Review Focus

1. The tapping-term slider writes exactly `tapping-term-ms` and nothing else; an untouched behavior's source is byte-identical.
2. The dialog: focus goes into it, Esc and the ✕ close it and return focus to "New behavior", picking a card creates, selects and closes.
3. `Switch` still reads as a checkbox to assistive tech and existing tests.
4. The "Use it on a key" jump lands on "Your behaviors" even if the palette is on the Keys half or collapsed.

---

### Task 1: `behaviorSummary` (core, TDD)
- hold-tap: `Hold: Key press · Tap: Key press · 200 ms` (names from `BUILTIN_BEHAVIORS`, term from the property or ZMK's default).
- mod-morph: `, → ; with Shift` (labels via `describeBinding`, mods from the property).
- tap-dance: `A · B · C`; encoder: `↻ Vol+ · ↺ Vol−`; macro: `3 steps`; module/other: its kind name.
- Commit "behaviorSummary: one line per behavior for the list".

### Task 2: `Dialog` and `Switch` primitives
- `Dialog({ open, title, onClose, children })`: `showModal()` when opened, closes on Esc (`cancel` event) and a ✕ `IconButton`, returns focus to the opener. jsdom polyfill for `showModal`/`close`.
- `Switch({ checked, onChange, label?, describedBy? })`: `<input type="checkbox" role="switch">` restyled as a track + thumb.
- Unit tests for both; add both to `/#design`. Commit.

### Task 3: List and New behavior dialog
- `BehaviorList`: sections Hold-taps, Mod-morphs, Tap-dances, Encoders, From modules, Other, each with a coloured icon header and count; empty kinds hidden. Items: kind dot, `&name` mono, summary. Empty state "Create your first behavior". Macros: one flat list with summaries.
- `NewBehaviorDialog`: four type cards (icon, name, one-sentence explanation, tiny illustration), buttons named `+ Hold-tap` etc.
- Update `Milestone4`, `Reorder`, `TapDance` tests and `scripts/screenshots.ts` to open the dialog first; new test for the grouping and the dialog. Commit.

### Task 4: Editor chrome and diagrams
- Header card: kind icon + colour, `&` name field, delete `IconButton` (same confirm).
- `HoldTapDiagram`: centre keycap, **Tap →** and **Hold →** arms with the behavior selects; timing strip (range 0–500 on `tapping-term-ms`, shaded quick-tap and prior-idle zones when set); flavor as a segmented control with a one-line description.
- `ModMorphDiagram`: "Normally [X]" and "With [mods] → [Y]" keycaps; mod chips bound to `mods`.
- `TapDanceDiagram`: horizontal tap cards (1×, 2×…) with the existing drag/move/remove and a "+ tap" card.
- `EncoderDiagram`: knob graphic with ↺ and ↻ bindings either side.
- "Advanced timing" `<details>` with the remaining `PropertyFields`; booleans as `Switch`.
- Footer tip "Use it on a key: palette → Your behaviors" + button that jumps there (the `jumpTo` palette prop).
- Module editors and `MacroSteps` inside the new chrome, restyled only.
- Tests: slider sets the term, flavor segment, mods chip, jump button switches view. Commit.

### Task 5: Verify
- typecheck, lint, full tests; the preview in dark and light at 1400 and ~1024 wide; keyboard walk through the dialog; create each kind; Download `.keymap` diff for an untouched behavior. Whole-branch review, then hand over for you to try.
