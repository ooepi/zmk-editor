# UI overhaul, Phase 2 (key palette): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cluttered palette with a clear drawer. It has:
- one line saying what a click will do;
- one search box across keys *and* behaviors;
- a category rail that scrolls to each section;
- the special tiles pinned at the top;
- a clearly labelled modifier step;
- a way to collapse the whole thing.

**Architecture:**
- **Section building** is a pure core function, `paletteSections(query, tiles)` in `src/core/keymap/paletteSections.ts`. It decides which key and behavior sections exist for a query.
- **UI split.** `KeyPalette.tsx` keeps its props and export, and is rebuilt from small parts in `src/ui/components/palette/`: `PaletteStatus`, `CategoryRail` and `ModifierBar`.
- **Unchanged pieces.** Placing, arming, drag and drop, and Recent all keep working through the existing `onPick`, `setPaletteDrag`, `pushRecent` and `usePreferences`.

**Tech Stack:** React 19, vitest + testing-library (jsdom), CSS in `src/ui/styles/palette.css`.

**Spec:** `docs/specs/2026-09-29-ui-overhaul-design.md`, "Phase 2: Key palette drawer". Branch `ui/palette` from `main`.

## Global Constraints

- Tokens only; `tokens.test.ts` and `contrast.test.ts` stay green. State lines use `--accent-line`.
- These accessible names are the tests' contract and must not change:
  - the region `Key palette`
  - tile names `Place <name> (<token>)`, `Place Transparent`, `Place None`, `Place recent …`, plus `aria-pressed` on armed tiles
  - the searchbox `Search the palette`
  - the groups `Recently used` and the per-section groups (`Numbers`, `Bluetooth & output`, `Keys` while searching, …)
  - the buttons `Clear recently used` and `Hold <modifier name> with placed keys`
- The Keys/Behaviors segmented toggle and the `Search behaviors` box go away (the spec replaces them with one search). Tests that click them are updated.
- Categories scroll; they no longer filter. Nothing is hidden unless a search is typed.
- Modifiers apply to **key** tiles only, as today.
- Test runs use `npx vitest run --maxWorkers=6`.

## Review Focus

1. **What a click does is always stated.** The status line matches the real mode: armed, one key selected, several keys selected, or nothing. When armed it offers a working **Stop** (Task 3 tests).
2. **Search across both kinds.** Typing `blue` shows only Bluetooth behaviors. Typing `a` shows key results first. A search with no results says so, and the rail lists only the sections present (Task 1 and Task 2 tests).
3. **Modifiers are visible cause and effect.** Turning one on tints the bar, says which modifiers the key tiles will carry, and offers Clear. Behavior tiles are unaffected (Task 4 tests).
4. **Collapsing keeps working state.** The collapsed palette still shows the status line, and an armed tile can still be placed or stopped with Esc. The collapsed state survives a reload (Task 5 tests).
5. **Small heights (768px) and ≤900px widths.** The rail and tiles scroll independently, and nothing overflows (Task 6 visual check).

---

### Task 1: `paletteSections` (core)

**Files:**
- Create: `src/core/keymap/paletteSections.ts`, `src/core/keymap/paletteSections.test.ts`

**Interfaces:**
- Consumes: `searchKeycodes`, `KEYCODE_CATEGORIES` and `Keycode` from `core/catalog/keycodes.ts`; `BEHAVIOR_GROUPS` from `core/catalog/behaviors.ts`; `BehaviorTile` and `searchTiles` from `core/keymap/palette.ts`.
- Produces:

```ts
export type PaletteSection =
  | { id: string; title: string; kind: 'keys'; keycodes: Keycode[] }
  | { id: string; title: string; kind: 'behaviors'; tiles: BehaviorTile[] };
/** With no query: every key category, then every behavior group, in catalog order. With a query: one "Keys" section of ranked matches, then the matching behavior groups. Empty sections are left out. */
export function paletteSections(query: string, tiles: BehaviorTile[]): PaletteSection[];
```

  Section ids are `keys-<category>`, `keys` (while searching) and `behaviors-<group>`.

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, expect, it } from 'vitest';
import { demoConfig } from '../../ui/state/demo.ts';
import { behaviorTiles } from './palette.ts';
import { paletteSections } from './paletteSections.ts';

const tiles = behaviorTiles(demoConfig().config.keymap);
const titles = (query: string) => paletteSections(query, tiles).map((s) => s.title);

describe('paletteSections', () => {
  it('lists every key category and then the behavior groups when there is no search', () => {
    const all = titles('');
    expect(all.slice(0, 3)).toEqual(['Letters', 'Numbers', 'Symbols']);
    expect(all).toContain('Layers');
    expect(all.indexOf('Layers')).toBeGreaterThan(all.indexOf('Other'));
    expect(paletteSections('', tiles).every((s) => (s.kind === 'keys' ? s.keycodes.length : s.tiles.length) > 0)).toBe(true);
  });

  it('puts ranked key matches in one Keys section, then matching behavior groups', () => {
    const sections = paletteSections('esc', tiles);
    expect(sections[0]).toMatchObject({ id: 'keys', title: 'Keys', kind: 'keys' });
    expect(sections[0]?.kind === 'keys' && sections[0].keycodes[0]?.label).toBe('Esc');
  });

  it('finds behaviors by words', () => {
    expect(titles('blue')).toEqual(['Bluetooth & output']);
  });

  it('returns nothing when nothing matches', () => {
    expect(paletteSections('zzzz', tiles)).toEqual([]);
  });
});
```

  If the first `Keys` label for `esc` in the catalog isn't `Esc`, assert against what `searchKeycodes('esc')[0]` returns. The point is that ranked order is kept.

- [ ] **Step 2:** Run `npx vitest run src/core/keymap/paletteSections.test.ts`. Expected: FAIL, because the module is missing.
- [ ] **Step 3: Implement** with a straightforward map and filter over `KEYCODE_CATEGORIES` and `BEHAVIOR_GROUPS`, using `searchKeycodes(query)` and `searchTiles(tiles, query)`.
- [ ] **Step 4:** Run it. Expected: PASS. Commit with the message "paletteSections: key and behavior sections for a palette search".

### Task 2: One scrolling list, a category rail and pinned special tiles

**Files:**
- Create: `src/ui/components/palette/CategoryRail.tsx`
- Modify: `src/ui/components/KeyPalette.tsx`, `src/ui/KeyPalette.test.tsx`, `src/ui/PaletteImprovements.test.tsx`, `scripts/screenshots.ts`

**Interfaces:**
- Consumes: `paletteSections` from Task 1.
- Produces: `CategoryRail(props: { entries: { id: string; title: string; group: 'Keys' | 'Behaviors' | 'Recent' }[]; current: string | null; onJump: (id: string) => void })`.
  - It renders `<nav aria-label="Palette categories">`: a list of buttons with `aria-current="true"` on `current`, plus small "Keys" and "Behaviors" headings between the kinds.

- [ ] **Step 1: Update and add tests.** In `KeyPalette.test.tsx`, replace the "groups keys by category…" test with:

```tsx
  it('shows every section in one list and jumps to a category from the rail', async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = function (this: Element) { scrolled(this.id); };
    const user = userEvent.setup();
    render(<App />);
    expect(palette().getByRole('heading', { name: 'Letters' })).toBeTruthy();
    expect(within(palette().getByRole('group', { name: 'Layers' })).getByRole('button', { name: 'Place NUM (mo)' })).toBeTruthy();
    const rail = within(palette().getByRole('navigation', { name: 'Palette categories' }));
    await user.click(rail.getByRole('button', { name: 'Numbers' }));
    expect(scrolled).toHaveBeenLastCalledWith('palette-keys-numbers');
    expect(rail.getByRole('button', { name: 'Numbers' }).getAttribute('aria-current')).toBe('true');
    expect(palette().getByRole('heading', { name: 'Letters' })).toBeTruthy();
  });

  it('pins Transparent and None above the list', () => {
    render(<App />);
    const special = within(palette().getByRole('group', { name: 'Special' }));
    expect(special.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Place Transparent', 'Place None']);
  });
```

  - Import `vi` in this file if it isn't imported yet.
  - Remove `await user.click(palette().getByRole('button', { name: 'Behaviors' }));` at `KeyPalette.test.tsx:68`, and at `PaletteImprovements.test.tsx:45` and `:126`: behavior tiles are now in the same list.
  - In `PaletteImprovements.test.tsx:68-75`: drop the segment click, use `'Search the palette'` for both searchbox queries, and replace `getByText('No behaviors match.')` with `getByText('Nothing matches “zzzz”.')`.

- [ ] **Step 2:** Run `npx vitest run src/ui/KeyPalette.test.tsx src/ui/PaletteImprovements.test.tsx`. Expected: FAIL. The new tests fail because there's no rail and no Special group; the edited ones fail because behaviors aren't visible without the segment.
- [ ] **Step 3: Rewrite `KeyPalette.tsx`.**
  - **Keep** the props, the `tile()` renderer, `keyTile()`, the `recentTiles` computation, and the `TRANSPARENT`/`NONE` constants.
  - **Remove** the `tab` state, the segmented control, `behaviorQuery`, the category chip filter state and the `palette-fixed` block.
  - **Build** `const sections = useMemo(() => paletteSections(query, tiles), [query, tiles])`.
  - **Render**, inside `<section className="palette" aria-label="Key palette">`:
    - A `palette-body` grid holding `<CategoryRail/>` and `palette-main`.
    - `palette-main` holds `palette-tools` (the search input and the modifier bar, still the old markup until Task 4) and `palette-scroll`, the scroll container with `ref` and `onScroll`.
    - `palette-scroll` contains:
      - `<div role="group" aria-label="Special" class="palette-special">`, with the Transparent tile (`main '▽'`, `sub 'Trans'`) and the None tile (`main '✕'`, `sub 'None'`). It shows only while not searching.
      - A Recent section (`id="palette-recent"`) holding the `Recently used` group and the `Clear recently used` link-button in its header. It shows when there are recent items and no search.
      - Each section as `<div class="palette-group" id={`palette-${s.id}`}><h3 class="palette-group-title">{s.title}</h3><div class="palette-tiles" role="group" aria-label={s.title}>…</div></div>`.
      - When `query.trim()` gives no sections: `<p class="muted">Nothing matches “{query.trim()}”.</p>`.
  - **Rail entries:** Recent (if shown), then the sections, grouped by kind.
  - **`onJump(id)`:** calls `document.getElementById(`palette-${id}`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })` and sets `current`.
  - **`onScroll`:** `current` becomes the last section whose `offsetTop - scroller.offsetTop <= scroller.scrollTop + 8`.
  - **Search placeholder:** `Search keys and behaviors: a, esc, volume, bluetooth…`.
- [ ] **Step 4: `scripts/screenshots.ts`.** The multi-select shot clicked the palette's "Behaviors" segment. Replace that with a click on the rail's `Layers` button, so the shot shows layer tiles.
- [ ] **Step 5:** Run the full suite. Expected: all pass. Commit with the message "Palette: one list with a category rail and pinned special tiles".

### Task 3: A status line that says what a click does

**Files:**
- Create: `src/ui/components/palette/PaletteStatus.tsx`
- Modify: `KeyPalette.tsx` (replace the `hint` paragraph), `src/ui/App.tsx` (pass `onDisarm`), `src/ui/KeyPalette.test.tsx`

**Interfaces:**
- Produces: `PaletteStatus(props: { armed: { name: string } | null; selection: readonly number[]; hasEncoders: boolean; onStop: () => void })`. It renders `<p class="palette-status[ armed]" role="status">`.
- `KeyPalette` gains the prop `onDisarm: () => void`. `App` passes `() => setArmed(null)`.

- [ ] **Step 1: Write the failing tests** (`KeyPalette.test.tsx`, a new `describe('palette status')`):

```tsx
  const status = () => within(palette().getByRole('status'));

  it('says what a click will do in each mode', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(status().getByText(/Select a key, then click a tile/)).toBeTruthy();
    await user.click(keyButton('Key 25: A'));
    expect(status().getByText('Click a tile to put it on key 25, or drag a tile onto any key.')).toBeTruthy();
    await user.keyboard('{Control>}');
    await user.click(keyButton('Key 26: R'));
    await user.keyboard('{/Control}');
    expect(status().getByText(/on the 2 selected keys/)).toBeTruthy();
  });

  it('names the armed tile and stops placing it', async () => {
    const user = userEvent.setup();
    render(<App />);
    const tab = palette().getByRole('button', { name: 'Place Tab (TAB)' });
    await user.click(tab);
    expect(status().getByText(/Placing Tab: click keys to put it on them/)).toBeTruthy();
    await user.click(status().getByRole('button', { name: 'Stop placing' }));
    expect(tab.getAttribute('aria-pressed')).toBe('false');
  });
```

  Holding Control while clicking adds to the selection, the same pattern `MultiSelect.test.tsx` uses. In the demo, Key 25 is A and Key 26 is R.

- [ ] **Step 2:** Run it. Expected: FAIL, because there is no status role.
- [ ] **Step 3: Implement `PaletteStatus`.** The exact copy:
  - **Armed:** `Placing {name}: click keys to put it on them.` followed by `<button class="link-button" aria-label="Stop placing">Stop (Esc)</button>`.
  - **One key selected:** `Click a tile to put it on key {n}, or drag a tile onto any key.`
  - **Several keys selected:** `Click a tile to put it on the {k} selected keys, or drag a tile onto any key.`
  - **Nothing selected:** `Select a key, then click a tile. Or drag a tile onto any key.` plus, with encoders, ` Tiles also drop onto an encoder's ↺ or ↻ side.`
  - Every variant ends with `<HelpLink to="palette" />`.
  - The armed name: a keycode shows `keyExpressionLabel(token)`; a binding shows `describeBinding(binding, displayContext(keymap)).main`.
- [ ] **Step 4:** Run the full suite. Expected: pass. Commit with the message "Palette status line: says what a click will do".

### Task 4: The modifier bar

**Files:**
- Create: `src/ui/components/palette/ModifierBar.tsx`
- Modify: `KeyPalette.tsx`, `src/ui/KeyPalette.test.tsx`

**Interfaces:**
- Produces: `ModifierBar(props: { mods: ModifierFunction[]; onToggle: (m: ModifierFunction) => void; onClear: () => void })`.
  - It renders `<div class="palette-mods[ active]">`, holding `<span class="palette-mods-label">`, `<div role="group" aria-label="Add modifiers">` with 8 toggles (keeping their names `Hold <name> with placed keys`), and, when active, `<span class="palette-mods-summary">` plus a `Clear modifiers` button.

- [ ] **Step 1: Update and write the failing tests.** In the "keeps the modifiers in their own labelled group" test, the group becomes `'Add modifiers'`, still with 8 buttons. Add:

```tsx
  it('says which modifiers key tiles will carry, and clears them', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(palette().getByRole('button', { name: 'Hold Left Ctrl with placed keys' }));
    await user.click(palette().getByRole('button', { name: 'Hold Left Shift with placed keys' }));
    expect(palette().getByText('Key tiles will send Ctl+Sft with the key.')).toBeTruthy();
    expect(palette().getByRole('button', { name: 'Place NUM (mo)' })).toBeTruthy();
    await user.click(palette().getByRole('button', { name: 'Clear modifiers' }));
    expect(palette().getByRole('button', { name: 'Place A (A)' })).toBeTruthy();
  });
```

- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement.** At rest the label reads `Add modifiers`. While any modifier is on, the bar gets `.active` (an accent-soft tint with a 4px `--accent-line` inset bar) and the summary reads `Key tiles will send {labels joined by +} with the key.` Place the bar directly above `palette-scroll`, under the search box.
- [ ] **Step 4:** Run the full suite. Expected: pass. Commit with the message "Palette modifier bar: visible cause and effect".

### Task 5: Collapse the drawer

**Files:**
- Modify: `src/ui/state/preferences.ts` (add `paletteCollapsed: boolean`, default `false`), `KeyPalette.tsx`, `src/ui/KeyPalette.test.tsx`

- [ ] **Step 1: Write the failing test:**

```tsx
  it('collapses to its status line, remembers it, and still places an armed tile', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.click(palette().getByRole('button', { name: 'Place Tab (TAB)' }));
    await user.click(palette().getByRole('button', { name: 'Hide palette' }));
    expect(palette().queryByRole('searchbox', { name: 'Search the palette' })).toBeNull();
    expect(palette().getByRole('status').textContent).toMatch(/Placing Tab/);
    await user.click(keyButton('Key 0: Esc'));
    expect(keyButton('Key 0: Tab')).toBeTruthy();
    unmount();
    render(<App />);
    expect(palette().getByRole('button', { name: 'Show palette' }).getAttribute('aria-expanded')).toBe('false');
  });
```

  The test file's `beforeEach` must call `localStorage.clear()` and `reloadPreferences()`. Check that it already does (it clears Recent); add it if not.

- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - A `palette-head` row holds `<PaletteStatus/>` and an `IconButton` whose `icon` is `left`/`right` rotated by CSS (or add `chevron` paths to `Icon.tsx`: `chevronDown: ['m6 9 6 6 6-6']`, `chevronUp: ['m18 15-6-6-6 6']`). Its `label` is `Hide palette`/`Show palette`, with `aria-expanded={!collapsed}`, and it runs `setPreferences({ paletteCollapsed: !collapsed })`.
  - While collapsed, `palette-body` isn't rendered and the section gets `.collapsed`.
- [ ] **Step 4:** Run the full suite. Expected: pass. Commit with the message "Collapsible palette drawer, remembered per browser".

### Task 6: Styles and finish

**Files:**
- Modify: `src/ui/styles/palette.css` (rewrite the layout parts, keep the tile and kind styles), `src/ui/styles/panels.css` (≤900px)

- [ ] **Layout:**
  - `.palette`: `margin: 0 var(--s-3) var(--s-3) var(--s-4); border-radius: var(--r-lg); background: var(--surface); box-shadow: var(--shadow-float); display: flex; flex-direction: column; max-height: 38vh; min-height: 0; border-top: none; padding: 0`.
  - `.palette.collapsed`: `max-height: none`.
  - `.palette-head`: `display: flex; align-items: center; gap: var(--s-3); padding: var(--s-3) var(--s-4); border-bottom: 1px solid var(--border)`. The border goes away while collapsed.
  - `.palette-status`: `flex: 1; margin: 0; font-size: var(--fs-sm); color: var(--text-muted)`. `.palette-status.armed`: `color: var(--text); font-weight: 600`, with a lime dot in front, `::before` being `8px var(--accent)` round.
  - `.palette-body`: `flex: 1; min-height: 0; display: grid; grid-template-columns: 168px minmax(0, 1fr)`.
  - `.palette-rail`: `overflow-y: auto; padding: var(--s-2); border-right: 1px solid var(--border); display: flex; flex-direction: column; gap: 2px`. The rail button is `text-align: left; min-height: 30px; padding: 0 var(--s-3); border: none; border-radius: var(--r-sm); background: transparent; color: var(--text-muted); font-size: var(--fs-sm); font-weight: 500`, with `[aria-current='true']` giving `background: var(--accent-soft); color: var(--text); box-shadow: inset 3px 0 0 var(--accent-line)`. `.palette-rail-heading` is styled like `.panel-title` with `margin: var(--s-2) var(--s-3) var(--s-1)`.
  - `.palette-main`: `display: flex; flex-direction: column; min-height: 0; min-width: 0`.
  - `.palette-tools`: `display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3); padding: var(--s-3) var(--s-4) 0`. The search input is `flex: 1 1 260px; max-width: 420px`.
  - `.palette-mods` is a pill row with `padding: var(--s-1) var(--s-3); border-radius: var(--r-pill)`. `.active`: `background: var(--accent-soft); box-shadow: inset 4px 0 0 var(--accent-line)`.
  - `.palette-scroll`: `flex: 1; min-height: 0; overflow-y: auto; padding: var(--s-3) var(--s-4) var(--s-4); scroll-padding-top: var(--s-2)`.
  - `.palette-special`: `display: flex; gap: var(--s-2); margin-bottom: var(--s-3)`.
- [ ] **≤900px:** `.palette-body { grid-template-columns: 1fr }`. `.palette-rail` becomes a horizontal chip row: `flex-direction: row; overflow-x: auto; border-right: none; border-bottom: 1px solid var(--border)`, with its headings hidden.
- [ ] Remove the rules for markup that's gone: `.palette-bar`, `.palette-fixed`, `.palette-hint`, `.segmented` inside the palette, `.palette-filters` and `.palette-recent*` (replace them with the section styles).
- [ ] Run `npm run typecheck && npm run lint && npx vitest run --maxWorkers=6`. Expected: green.
- [ ] **Preview check** (the `dev` config) in dark and light, at 1400×860, 1024×768 and 800×900:
  - the status line in all 4 modes;
  - the rail jumps and highlights while scrolling;
  - search for `blue`, `a` and `zzzz`;
  - the modifier bar tints;
  - collapse and expand;
  - no overflow and no console errors.

  Take screenshots.
- [ ] Run `npm run screenshots`, then the whole-branch review, then a PR against `main`.
