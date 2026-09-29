# UI/UX overhaul — design

Status: approved 2026-09-29. Delivered in phased PRs (Phase 0–6 below); each phase gets its own plan in `docs/plans/`.


## Context

The editor's features are done, but the UI is utilitarian: every control has the same visual weight, so each page reads as a wall of equal-priority text, borders and buttons. Pain points reported: cluttered key palette (1), horizontal layer bar with a detached action strip (2), plain view tabs (3), an overwhelming settings page (4), behaviors list mixed with "create" buttons and a form-only editor (5), a toolbar of eight text buttons (6), a combo flow with no sense of "done/saved" (7), and a dated overall look (8).

**Outcome:** every page has one obvious focal point. Colour and icons carry meaning, and controls are modern, rounded and spaced out. Nothing changes in the generated keymap or config files: this is purely presentation and interaction.

**Decisions made with the user**
- Visual direction **A: graphite + lime**: warm near-black, pill tabs, round icon buttons, one bright lime accent. Key kinds keep their own semantic colours (layer blue, hold amber, macro violet). A matching light theme is derived.
- Typeface **Plus Jakarta Sans** (variable, bundled via `@fontsource-variable/plus-jakarta-sans`), with **JetBrains Mono** (`@fontsource-variable/jetbrains-mono`) for keycodes and code. No CDN, in line with the app's "loads nothing external" stance (`Icon.tsx` header comment).
- Palette becomes a **drawer with a category rail** and one unified search.
- **Phased PRs**, each shippable on its own and branched from `main`.

## Cross-cutting approach

- **Split `src/ui/styles.css` (2,950 lines)** into `src/ui/styles/`: `tokens.css`, `base.css`, `controls.css`, then one file per area (`shell.css`, `keyboard.css`, `palette.css`, `panels.css`, `behaviors.css`, `settings.css`, `pages.css`, `print.css`). Import them from `src/main.tsx` in place of `./ui/styles.css`. Phase 0 splits the file mechanically with no visual change, so later diffs stay readable.
- **Tokens** (`tokens.css`) replace the current `:root` block. Keep the existing variable names that components already use (`--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-muted`, `--accent`, `--accent-soft`, `--accent-contrast`, `--danger`, `--keycap*`, `--key-layer|hold|macro|dim`) so nothing breaks, and add:
  - `--surface-3`, `--accent-text` (lime is too light for text on light backgrounds), `--success`, `--warning`, `--info`
  - Radii `--r-sm 8px / --r-md 12px / --r-lg 18px / --r-pill 999px`
  - Spacing `--s-1…--s-8` (4px steps), `--shadow-float` (for floating rails and menus), `--dur-fast`, `--ease-out`
  - Type scale `--fs-xs 12 / sm 13 / md 14 / lg 16 / xl 20 / 2xl 26`
  - Behavior-kind hues: `--kind-holdtap` amber, `--kind-modmorph` pink, `--kind-tapdance` cyan, `--kind-encoder` blue, `--kind-macro` violet, `--kind-module` neutral
  - Dark values: bg `#121212`, surface `#1b1b1d`, surface-2 `#242427`, surface-3 `#2e2e32`, text `#f1f1ee`, muted `#9a9a94`, accent `#d7f46c`, accent-contrast `#1a1f05`.
  - Light values: bg `#efefeb`, surface `#fff`, accent fill `#c8e650` with dark text, and `--accent-text: #4f6a00`.
  - The `.print-sheet` light override stays.
- **Shared primitives**, new and small, in `src/ui/components/ui/`:
  - `IconButton.tsx`: round button with `aria-label`. An optional `label` expands on hover or focus with a CSS width transition. Disabled buttons keep their `title` reason.
  - `Menu.tsx`: an accessible dropdown (`aria-haspopup="menu"`, `role=menu/menuitem`). It supports arrow keys, Home/End and Esc, closes on outside click and returns focus to the trigger. No library.
  - `Dialog.tsx`: a thin wrapper over native `<dialog>` + `showModal()`, used by the behavior type picker. If jsdom lacks `showModal`, add a small polyfill in `src/ui/testUtils.ts`.
  - `Switch.tsx`: a toggle switch (a visually-restyled `<input type="checkbox" role="switch">`), so existing `getByRole('checkbox'|'switch')` queries still work.
  - `Section.tsx` (card with title, optional description and actions) and `Badge.tsx` (tinted pill with a `tone` prop).
- **Icons:** extend `PATHS` in `src/ui/components/Icon.tsx` with more Lucide shapes: keyboard, link, sliders, list-ordered (macros), puzzle (modules), monitor (screens), settings, grip-vertical, more-horizontal, x, check, search, clock, layers, battery, bluetooth, zap, sun-dim, mouse-pointer, usb, timer, rotate-cw, hand (hold), pointer (tap). This keeps the zero-dependency approach.
- **Accessible names are the test contract.** Tests query by role and name (e.g. `'Undo'`, `'Add layer'`, `'+ Hold-tap'`, `'Print keymap'`). Keep `aria-label`s stable where possible. Where a flow changes (e.g. `'+ Hold-tap'` now sits inside a dialog), update the test and `scripts/screenshots.ts` in the same PR.

## Phase 0: Foundation (point 8)
**Branch:** `ui/foundation`
1. Commit this design as `docs/specs/2026-09-29-ui-overhaul-design.md`, following the repo's specs/plans convention. Each later phase adds its own `docs/plans/…` file before implementation.
2. Split the stylesheet mechanically (no visual change) and commit that separately.
3. Add the font packages, the new tokens and the dark/light values. Restyle the base controls in `controls.css`: `.button` (pill, 36px, primary = lime fill), `.icon-button`, `.input`/`select` (12px radius, 40px, filled background, custom chevron), `.chip`, `.segmented`, `.badge`, checkboxes, focus ring (lime, 2px offset), scrollbars and `.notice`. Adjust `--keycap*` for the graphite look: softer top face, 10px radius.
4. Add the shared primitives and icons (unused until later phases, except `IconButton`).

After this phase every page already looks modern, because all of them share these classes.

## Phase 1: App shell (points 2, 3, 6)
**Branch:** `ui/shell`. Files: `App.tsx`, `Toolbar.tsx`, `LayerBar.tsx` → `LayerRail.tsx`, `ThemeToggle.tsx`, `styles/shell.css`.

**Top bar (6).** Left: brand, then the keyboard picker and ZMK version as compact pill selects. Right: a floating pill group of `IconButton`s:
- Undo and Redo
- Open from GitHub: `OpenFromGitHub` gets an icon-only trigger variant with the same "Open from GitHub" accessible name
- Print cheat sheet: keeps `aria-label="Print keymap"`
- A `…` **More** menu (`Menu`) with Open files…, Download .keymap, Download config (.zip), a separator and Reset to demo (danger tone)

Then the theme toggle, help and the coffee link as a small ghost button. The labels expand on hover. The disabled states and `lockedTitle` behaviour stay as they are.

**View tabs (3).** A floating pill segmented nav under the top bar. Each tab has an icon: keyboard, link (Combos), sliders (Behaviors), list-ordered (Macros), puzzle (Modules), monitor (Screens), settings. Counts become small `Badge`s instead of "(4)" text; accessible names stay "Combos (0)" etc. The active tab is a lime-filled pill. **Help leaves the tab row**, because the top-bar `?` already opens it (update `Help.test.tsx`, which clicks the "Help" tab). **Build & flash** is set apart on the right as the only accent-outlined call-to-action, with the rocket icon.

**Layer rail (2).** Replace the horizontal `LayerBar` with a vertical floating rail on the left edge of the canvas (`--shadow-float`, 18px radius), modelled on the reference image.
- Each layer is a pill showing its index and name. The active one is a lime-tinted pill.
- On hover or keyboard focus a pill widens to show a **grip handle** (drag to reorder, using the existing `useReorder('layers')` with axis `'y'`), a **pencil** (rename, reusing the existing inline rename input) and a **trash** button (delete that layer, keeping the existing confirm).
- A `+` button at the bottom adds a layer (`aria-label="Add layer"`).
- Double-click rename, drag-hover-to-switch (`HOVER_SWITCH_MS`) and all dispatch actions are reused unchanged.
- The grip handle also supports Alt+↑/↓ to move a layer for keyboard users, replacing the ←/→ buttons.
- Per-layer names become `Delete layer NAV` / `Rename layer NAV`; update the `'Delete layer'` query in `App.test.tsx`.

The canvas grid in `App.tsx` becomes `[rail] [canvas] [panel]`.

## Phase 2: Key palette drawer (point 1)
**Branch:** `ui/palette`. Files: `KeyPalette.tsx` (split into `palette/PaletteDrawer.tsx`, `palette/CategoryRail.tsx`, `palette/ModifierBar.tsx`), `styles/palette.css`. The helpers `searchKeycodes`, `searchTiles`, `behaviorTiles`, `pushRecent`, `KEYCODE_CATEGORIES` and `BEHAVIOR_GROUPS` are reused as they are.

- **One status line at the top** replaces the long hint and says exactly what a click will do. Examples: "Click a tile to place it on key 25"; "Placing **A**: click keys · Esc to stop" (lime, with a ✕ to stop); "Select a key, or drag a tile onto one".
- **One search box** that searches keys *and* behaviors together. Results are split into "Keys" and "Behaviors" sections. The Keys/Behaviors segmented toggle goes away.
- **Category rail (vertical, left side of the drawer)**, with icons:
  - ★ Recent, holding the recent tiles and a "Clear" action inside that view. It replaces the always-visible Recent row.
  - The key categories.
  - A divider, then the behavior groups: Layers, Bluetooth and output, Mouse, Lighting, System, Your behaviors, and so on.
  - Clicking a category scrolls the tile area to that section (a scroll-spy highlights the current one), so browsing still works and nothing is hidden.
- **Transparent ▽ and None ✕** become the first two tiles of a pinned "Special" group at the top of the tile area, each with a label under the glyph.
- **Modifier bar:** "Add modifiers" plus toggle chips, placed directly above the tiles it affects. While any modifier is on, the bar is tinted and reads "Tiles will include Ctrl+Shift" with a "Clear" button, and the tiles show the modifier prefix. Cause and effect are visible in one place.
- The drawer can collapse to a slim bar (a chevron; the state is remembered in `preferences.ts`) so the keyboard can take the full height.
- Palette tiles get kind colours through `--kind-*` tokens.
- Keep the region name "Key palette", the tile `aria-label="Place …"` and `aria-pressed`. Update `KeyPalette.test.tsx`, `PaletteImprovements.test.tsx` and the screenshots script, which click the "Behaviors" segment.

## Phase 3: Combos flow (point 7)
**Branch:** `ui/combos`. Files: `CombosPanel.tsx`, `App.tsx`, `KeyboardCanvas.tsx` (highlight states only), `styles/panels.css`.

- **The combo list is cards**, each showing a visual formula of mini keycaps, e.g. `[B] + [G] → [Esc]`, using the existing `describeBinding` labels for the key positions on layer 0. Layer chips appear if the combo is layer-restricted.
- **An explicit edit mode.** "New combo" (a primary button) creates the combo and opens the editor in a *recording* state:
  - A lime banner over the canvas reads "Click the keys for this combo · 2 selected".
  - The chosen keys glow lime; the existing yellow outline becomes the lime/amber "combo key" style.
  - The editor shows the step order: ① Keys, ② Sends, ③ Options, where Options is a collapsed `<details>` holding layers and timing.
- **A clear exit:** a **Done** button, Esc, or clicking the empty canvas closes the editor and deselects. A brief "Combo saved" toast confirms it (reusing the `notify` notice mechanism, restyled as a toast in Phase 0). Edits are applied live and undoable as before, so the toast is truthful.
- An invalid combo (fewer than 2 keys) shows a warning badge on its card and stops Done with an inline message, instead of silently persisting.
- Keep `'+ New combo'` as the accessible name (used in `Print.test.tsx`).

## Phase 4: Behaviors and macros (point 5)
**Branch:** `ui/behaviors`. Files: `BehaviorsView.tsx` (split into `behaviors/BehaviorList.tsx`, `behaviors/NewBehaviorDialog.tsx`, `behaviors/HoldTapDiagram.tsx`, `behaviors/ModMorphDiagram.tsx`, `behaviors/TapDanceDiagram.tsx`, `behaviors/EncoderDiagram.tsx`), `MacroSteps.tsx` (styling only), `styles/behaviors.css`. `createBehavior`, `KIND_LABELS`/`kindLabel`, `BindingEditor` and `PropertyFields` are reused.

- **List:**
  - Grouped into sections by kind (Hold-taps, Mod-morphs, Tap-dances, Encoders, From modules, Other). Each section has a coloured icon header in its `--kind-*` hue and a count.
  - Each item shows a coloured left dot, `&name` in mono, and a one-line summary (e.g. "tap A · hold Shift", "200 ms").
  - Empty kinds are hidden.
  - An empty state invites the user: "Create your first behavior".
- **Creating:** one **"New behavior"** primary button above the list opens `NewBehaviorDialog`. The dialog shows a grid of type cards, each with an icon, a name, a one-sentence explanation and a tiny illustration, for example "Hold-tap: one key, two jobs — tap for one thing, hold for another". The card buttons keep the accessible names `'+ Hold-tap'`, `'+ Mod-morph'`, `'+ Encoder behavior'` and `'+ Tap-dance'`, so tests only add a step that opens the dialog first. Macros keep a single "New macro" button, since there is only one kind.
- **Editor, as a visual layout instead of a form:**
  - A header card with the kind icon and colour, the name field (`&` prefix shown), and a delete icon button.
  - A diagram section per kind:
    - *Hold-tap:* a large keycap in the centre, with two labelled arms: **Tap →** [binding select] and **Hold →** [binding select]. Below it, a **timing strip**: a horizontal bar from 0 to 500 ms showing the tapping term as a draggable marker (a range input bound to `tapping-term-ms`), with quick-tap and prior-idle shown as shaded zones when set. Flavor becomes a segmented control with a one-line description of the selected flavor.
    - *Mod-morph:* two keycaps side by side, "Normally [X]" and "With [mods] → [Y]". Mods are toggle chips bound to the existing `mods` property.
    - *Tap-dance:* a horizontal sequence of tap cards (1×, 2×, 3×, …) with drag reorder (existing `useReorder('tap-dance')`) and a "+ tap" card at the end.
    - *Encoder:* a knob graphic with ↺ and ↻ bindings on either side, matching the canvas `EncoderStrip` style.
  - "**Advanced timing**" `<details>` holds the rest of `PropertyFields` (hold-trigger keys, retro tap, etc.), with booleans rendered as `Switch`.
  - A footer tip: "Use it on a key: palette → Your behaviors" with a button that jumps to the Keymap tab with the palette on "Your behaviors".
- Module behaviors (`LeaderKeyEditor`, `AdaptiveKeyEditor`, `TriStateBindings`, `SourceEditor`) keep their current editors inside the new header and card chrome. Only their styling changes.

## Phase 5: Settings (point 4)
**Branch:** `ui/settings`. Files: `SettingsView.tsx`, `src/core/catalog/settings.ts` (data only), `styles/settings.css`.

- **Two-pane layout.** A left section nav lists the 8 `SETTING_GROUPS`, each with an icon (zap, bluetooth, battery, sun, sun-dim, monitor, mouse-pointer, usb) and a lime "3 changed" counter. Only the **selected group** shows on the right, instead of all 54 settings at once. The warnings banner stays at the top and names its group, with a link to it.
- **Group view:** a title and description, then a clean list of rows. Each row has the label (primary text) with the help text below it (secondary, 13px) on the left, and the control on the right: a `Switch` for booleans, compact inputs with a unit suffix for ints, a select for choices.
  - Changed rows get a lime left marker, a "Changed" badge and an inline reset icon. Keep `aria-label="Reset … to default"`, which is used in `Settings.test.tsx`.
  - "Default: …" moves into the help line in muted text.
  - Millisecond values show a live human readout ("5 min").
  - The grey-out for `unavailable` hardware stays.
- **Basic vs advanced:** add an optional `advanced?: true` to `SettingDef` in `settings.ts` for rarely changed items: experimental BT flags, passkey, TX power, encoder processing thread, smooth scrolling, debug and logging, NKRO details. Each group shows its basic settings, then a "Show N advanced settings" toggle.
- A top-right **"Changed only"** filter shows every modified setting across all groups on one screen, for a quick review.
- "Other settings in the file" and the raw `.conf` editor move into a final nav entry, "Raw .conf". `RawConf` is reused unchanged.
- Add a unit test for the advanced flags or grouping in `settings.test.ts`, and update `Settings.test.tsx` for the group navigation (click the group, then find the setting).

## Phase 6: Sweep of the remaining pages
**Branch:** `ui/sweep`. The foundation already restyles these; this phase applies `Section`, `Badge`, `IconButton` and spacing so they match. Covered: the right-hand details panel (`BindingPanel`, `SelectionPanel`, `EncoderPanel`, `ConditionalLayersPanel`, overview empty state), `ModulesView`, `ScreensView`, `BuildView` (step cards), `KeyboardView`, `LayoutDesigner` and `HardwareWizard` (stepper), `HelpView`, and the `VersionSelect` popover. Then check the print sheet is unchanged and refresh the README images with `npm run screenshots`.

## Verification (every phase)

- `npm run typecheck`, `npm run lint` and `npm test`: all green, with updated queries only where a flow deliberately changed.
- Visual check with the `dev` launch config (`.claude/launch.json`, port 5173) in the preview browser:
  - screenshots of the affected pages in **dark and light**, at 1400×860 and at a narrow width (~1024)
  - keyboard-only walk-throughs: Tab and Esc through menus, the rail and the dialog; focus visible everywhere
  - no console errors
- Flow checks per phase:
  - Shell: undo/redo, each More-menu action, layer add/rename/reorder/delete via hover and via keyboard.
  - Palette: search across keys and behaviors, armed placing, modifiers, Recent.
  - Combos: create → pick keys → Done → toast → deselected, and undo.
  - Behaviors: create each kind from the dialog, drag the tapping-term marker, and check the generated `.keymap` via Download is unchanged for untouched behaviors.
  - Settings: change and reset values, advanced toggle, Changed-only filter, raw `.conf` round-trip.
- Before merging each phase: `superpowers:requesting-code-review`, then a PR against `main` with before/after screenshots.
