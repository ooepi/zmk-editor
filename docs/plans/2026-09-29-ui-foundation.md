# UI overhaul, Phase 0 (foundation): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every page the graphite + lime look (tokens, font, rounded and spacious controls) without changing any markup or behaviour.

**Architecture:** First split `src/ui/styles.css` into ordered files with no visual change. Then pull the generic control rules into `controls.css`, which loads before the area files. Then swap the tokens and restyle the controls. This is CSS only, plus two bundled font packages.

**Tech Stack:** Vite 8 CSS imports, `@fontsource-variable/plus-jakarta-sans`, `@fontsource-variable/jetbrains-mono`.

**Spec:** `docs/specs/2026-09-29-ui-overhaul-design.md` (Cross-cutting approach, Phase 0).

**Scope note:** the spec lists the shared primitives (`IconButton`, `Menu`, `Dialog`, `Switch`, `Section`, `Badge`) and the new icons under Phase 0 with the words "unused until later phases". To avoid shipping dead code, each one lands in the phase that first uses it. Phase 1 adds `IconButton`, `Menu` and the icons.

## Global Constraints

- There are no markup or behaviour changes in this phase. `npm test` must pass **unchanged**.
- Fonts are bundled from npm. There is no CDN and no `<link>` to Google Fonts.
- Keep every existing variable name (`--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-muted`, `--accent`, `--accent-soft`, `--accent-contrast`, `--danger`, `--keycap`, `--keycap-top`, `--keycap-edge`, `--keycap-shadow`, `--key-layer`, `--key-hold`, `--key-macro`, `--key-dim`, `--font-sans`, `--font-mono`).
- Dark values: bg `#121212`, surface `#1b1b1d`, surface-2 `#242427`, surface-3 `#2e2e32`, text `#f1f1ee`, muted `#9a9a94`, accent `#d7f46c`, accent-contrast `#1a1f05`.
- Light values: bg `#efefeb`, surface `#ffffff`, `--accent-text: #4f6a00`. The light **fill** accent is `#a8cc2a`, not the spec's `#c8e650`, because `#c8e650` is too pale to work as a border or focus ring on white. Text on it stays dark (`#1a1f05`).
- `.print-sheet` always uses the light values.

## Review Focus

1. **Light theme with lime as text or border.** Lime on white is unreadable, so every `color: var(--accent)` becomes `var(--accent-text)` (Task 3, grep check).
2. **Printed cheat sheet.** It must stay light and legible. The new tokens (`--accent-text`, `--surface-3`, `--r-*`) must also be defined under `.print-sheet` (Task 3, print preview check).
3. **Narrow windows (1024px and 800px).** Taller 40px inputs and pill buttons must not overflow the top bar or the 340px panel (Task 4, resize check).
4. **Keyboard focus.** The focus ring must be visible on every control in both themes, including the pill buttons and the chips (Task 4, tab-through check).
5. **Font loading fails or is slow.** The font stack falls back to `system-ui`, `Segoe UI` or `sans-serif` with no layout jump big enough to clip keycap labels (Task 3, `font-display: swap` is the fontsource default).

---

### Task 1: Split the stylesheet mechanically

**Files:**
- Create: `src/ui/styles/index.css`, plus `tokens.css`, `base.css`, `shell.css`, `keyboard.css`, `palette.css`, `panels.css`, `views.css`, `editors.css`, `pages.css`, `settings.css`, `hardware.css`, `widgets.css` and `print.css` under `src/ui/styles/`
- Delete: `src/ui/styles.css`
- Modify: `src/main.tsx` (the import)

- [ ] **Step 1: Split the file by line ranges, in the original order.** Each range starts at a top-level section comment, so no rule or `@media` block is cut.

```bash
S=src/ui/styles.css; D=src/ui/styles; mkdir -p $D
sed -n '1,48p'      $S > $D/tokens.css
sed -n '49,86p'     $S > $D/base.css
sed -n '87,326p'    $S > $D/shell.css
sed -n '327,647p'   $S > $D/keyboard.css
sed -n '648,849p'   $S > $D/palette.css
sed -n '850,1071p'  $S > $D/panels.css
sed -n '1072,1209p' $S > $D/views.css
sed -n '1210,1438p' $S > $D/editors.css
sed -n '1439,1992p' $S > $D/pages.css
sed -n '1993,2062p' $S > $D/settings.css
sed -n '2063,2539p' $S > $D/hardware.css
sed -n '2540,2779p' $S > $D/widgets.css
sed -n '2780,$p'    $S > $D/print.css
```

- [ ] **Step 2: Check that the pieces reassemble into the original byte for byte.**

Run: `cat $D/{tokens,base,shell,keyboard,palette,panels,views,editors,pages,settings,hardware,widgets,print}.css | cmp - src/ui/styles.css && echo SAME`
Expected: `SAME`

- [ ] **Step 3: Check that each piece has balanced braces.**

Run: `for f in $D/*.css; do o=$(tr -cd '{' <$f|wc -c); c=$(tr -cd '}' <$f|wc -c); [ $o = $c ] || echo "UNBALANCED $f"; done`
Expected: no output.

- [ ] **Step 4: Write `src/ui/styles/index.css`** (order matters: it is the cascade order):

```css
/* The app's styles, in cascade order. */
@import './tokens.css';
@import './base.css';
@import './shell.css';
@import './keyboard.css';
@import './palette.css';
@import './panels.css';
@import './views.css';
@import './editors.css';
@import './pages.css';
@import './settings.css';
@import './hardware.css';
@import './widgets.css';
@import './print.css';
```

- [ ] **Step 5:** In `src/main.tsx`, replace `import './ui/styles.css';` with `import './ui/styles/index.css';`, then run `git rm src/ui/styles.css`.

- [ ] **Step 6: Verify.** Run `npm run build && npm test`. Expected: the build succeeds and all tests pass. The built CSS in `dist/assets/*.css` should be the same size as before, within a few bytes.

- [ ] **Step 7: Commit** with the message "Split styles.css into ordered area files (no visual change)".

### Task 2: Move the generic control rules into `controls.css`

**Files:**
- Create: `src/ui/styles/controls.css`
- Modify: `src/ui/styles/index.css` (import `controls.css` right after `base.css`), and cut the rules below from `shell.css`, `panels.css`, `palette.css` and `editors.css`

The rules to move are single-class or compound selectors on generic controls:
- from `shell.css`: `.badge`, the `.button`/`.icon-button` block and its `:has(> .icon)`, `.icon`, `:hover`, `:disabled` and `.icon-button.danger` rules, `.link-button`, `.panel-title`, `.muted`, `.small` and `.notice`
- from `palette.css`: `.segmented`, `.segment` and `.segment.active`
- from `panels.css`: `.field`, `.field-label`, `.input`, `.input:focus`, `.input.invalid`, `.mono`, `.row`, `.chips`, `.chip`, `.chip.active` and `.chip:disabled`
- from `editors.css`: `.item-list`, `.item`, its `:hover` and `.active` states, `.fieldset`, `.fieldset legend`, `.field.checkbox`, `.field.checkbox .field-help`, `.field-help`, `.field-error`, `.button.danger:hover…`, `.row.wrap` and `.grow`
- from `pages.css`: `.button.primary`, `.button.active` and `.notice.warn`

Contextual rules such as `.palette-chips .chip` and `.help-button` stay where they are. They come later in the cascade and keep overriding the base rules.

- [ ] **Step 1:** Cut those blocks verbatim into `controls.css`, grouped under the headings `/* Text */`, `/* Buttons */`, `/* Fields */`, `/* Chips and segments */`, `/* Lists */` and `/* Notices */`. Add `@import './controls.css';` after `base.css` in `index.css`.
- [ ] **Step 2:** Run `npm run build && npm test`. Expected: pass.
- [ ] **Step 3: Visual no-change check.** Start the `dev` preview (`.claude/launch.json`). Screenshot Keymap (with key 25 selected), Behaviors (after "+ Hold-tap"), Settings and Build, and compare them with screenshots taken from `main` before Task 1. Expected: identical apart from rules that previously lost a same-specificity tie. Fix any difference by adding a contextual selector in the area file.
- [ ] **Step 4: Commit** with the message "Gather generic control styles into controls.css".

### Task 3: Fonts and graphite + lime tokens

**Files:**
- Modify: `package.json`/`package-lock.json` (dependencies), `src/main.tsx`, `src/ui/styles/tokens.css`, and every `color: var(--accent)` in `src/ui/styles/*.css`

- [ ] **Step 1:** Run `npm install @fontsource-variable/plus-jakarta-sans @fontsource-variable/jetbrains-mono`.
- [ ] **Step 2:** In `src/main.tsx`, above the styles import, add:

```ts
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/jetbrains-mono';
```

- [ ] **Step 3: Replace `tokens.css` entirely:**

```css
:root,
:root[data-theme='dark'] {
  --bg: #121212;
  --surface: #1b1b1d;
  --surface-2: #242427;
  --surface-3: #2e2e32;
  --border: #2f2f33;
  --border-strong: #404046;
  --text: #f1f1ee;
  --text-muted: #9a9a94;
  --accent: #d7f46c;
  --accent-text: #d7f46c;
  --accent-soft: rgb(215 244 108 / 13%);
  --accent-contrast: #1a1f05;
  --danger: #ff6b6b;
  --danger-soft: rgb(255 107 107 / 12%);
  --success: #6ee7a8;
  --warning: #f5b86b;
  --info: #7aa7ff;
  --keycap: #202023;
  --keycap-top: #29292d;
  --keycap-edge: #36363b;
  --keycap-shadow: rgb(0 0 0 / 50%);
  --key-layer: #7aa7ff;
  --key-hold: #f5b86b;
  --key-macro: #c792ea;
  --key-dim: #55555b;
  --kind-holdtap: #f5b86b;
  --kind-modmorph: #f38ba8;
  --kind-tapdance: #67d8ef;
  --kind-encoder: #7aa7ff;
  --kind-macro: #c792ea;
  --kind-module: #9a9a94;
  --shadow-float: 0 10px 30px rgb(0 0 0 / 35%), 0 1px 0 rgb(255 255 255 / 4%) inset;
  --font-sans: 'Plus Jakarta Sans Variable', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono Variable', ui-monospace, 'Cascadia Code', Consolas, monospace;
  --r-sm: 8px;
  --r-md: 12px;
  --r-lg: 18px;
  --r-pill: 999px;
  --s-1: 4px;
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --s-5: 20px;
  --s-6: 24px;
  --s-8: 32px;
  --fs-xs: 12px;
  --fs-sm: 13px;
  --fs-md: 14px;
  --fs-lg: 16px;
  --fs-xl: 20px;
  --fs-2xl: 26px;
  --dur-fast: 140ms;
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  color-scheme: dark;
}

:root[data-theme='light'],
/* The printed cheat sheet is always light, whatever the screen theme. */
.print-sheet {
  --bg: #efefeb;
  --surface: #ffffff;
  --surface-2: #f4f4f0;
  --surface-3: #e8e8e3;
  --border: #dcdcd5;
  --border-strong: #c4c4bc;
  --text: #17171a;
  --text-muted: #62625c;
  --accent: #a8cc2a;
  --accent-text: #4f6a00;
  --accent-soft: rgb(168 204 42 / 18%);
  --accent-contrast: #1a1f05;
  --danger: #d43d3d;
  --danger-soft: rgb(212 61 61 / 10%);
  --success: #1f9d5c;
  --warning: #b86a0b;
  --info: #2f6fe0;
  --keycap: #ffffff;
  --keycap-top: #ffffff;
  --keycap-edge: #d2d2cb;
  --keycap-shadow: rgb(30 30 20 / 12%);
  --key-layer: #2f6fe0;
  --key-hold: #b86a0b;
  --key-macro: #8a3fc4;
  --key-dim: #b3b3ab;
  --kind-holdtap: #b86a0b;
  --kind-modmorph: #c2386b;
  --kind-tapdance: #0f8aa3;
  --kind-encoder: #2f6fe0;
  --kind-macro: #8a3fc4;
  --kind-module: #62625c;
  --shadow-float: 0 10px 30px rgb(30 30 20 / 10%), 0 1px 2px rgb(30 30 20 / 6%);
  color-scheme: light;
}
```

- [ ] **Step 4: Accent as text becomes `--accent-text`.** Run `sed -i -E 's/(^|[^-])color: var\(--accent\)/\1color: var(--accent-text)/' src/ui/styles/*.css`, then `grep -nE "(^|[^-])color: var\(--accent\)" src/ui/styles/*.css`. Expected: no matches (about 11 were replaced). Also replace the leftover old-teal `rgb(94 224 193 / 12%)` with `var(--accent-soft)`, and `rgb(255 107 107 / 12%)` with `var(--danger-soft)`.
- [ ] **Step 5:** Run `npm run build && npm test`. Expected: pass. Check in the preview that dark and light both render with the new font: `getComputedStyle(document.body).fontFamily` starts with `"Plus Jakarta Sans Variable"`, and `document.fonts.check('14px "Plus Jakarta Sans Variable"')` is `true`.
- [ ] **Step 6: Commit** with the message "Graphite and lime tokens with bundled Plus Jakarta Sans and JetBrains Mono".

### Task 4: Restyle the base controls and surfaces

**Files:**
- Modify: `src/ui/styles/controls.css`, `src/ui/styles/base.css`, `src/ui/styles/shell.css` (top bar and panel surfaces only), `src/ui/styles/keyboard.css` (keycap shape only)

Target values. Edit the moved rules in place; don't add duplicates.

| Control | New style |
|---|---|
| `body` | `font-size: var(--fs-md)`, `line-height: 1.5`, `letter-spacing: -0.005em`, `font-feature-settings: 'ss01'` |
| `:focus-visible` | `outline: 2px solid var(--accent); outline-offset: 2px; border-radius: inherit` |
| `.button` | `height: 36px; padding: 0 var(--s-4); border-radius: var(--r-pill); background: var(--surface-2); border: 1px solid var(--border); font-weight: 600; font-size: var(--fs-sm); transition: background var(--dur-fast), border-color var(--dur-fast), transform var(--dur-fast)`. Hover: `background: var(--surface-3); border-color: var(--border-strong)`. Active: `transform: translateY(1px)`. Disabled: `opacity: .45` |
| `.button.primary` | `background: var(--accent); border-color: transparent; color: var(--accent-contrast)`; hover `filter: brightness(1.06)` |
| `.button.danger` | text `var(--danger)`; hover `background: var(--danger-soft); border-color: var(--danger)` |
| `.icon-button` | `width: 32px; height: 32px; padding: 0; border-radius: 50%`, centred content, same hover as `.button` |
| `.link-button` | `color: var(--accent-text); font-weight: 600`; hover underline |
| `.input`, `select.input` | `height: 40px; padding: 0 var(--s-3); border-radius: var(--r-md); background: var(--surface-2); border: 1px solid transparent`. Hover: `border-color: var(--border-strong)`. Focus: `border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft)`. Textareas get `height: auto; padding: var(--s-3)` |
| `select.input` | `appearance: none; padding-right: 36px`, with an inline-SVG chevron `background-image` (`stroke` in `currentColor` isn't possible in a data URI, so use `%239a9a94`) at `right 12px center` |
| `input[type=checkbox]` | `accent-color: var(--accent); width: 16px; height: 16px` |
| `.field` | `gap: 6px`. `.field-label`: `font-size: var(--fs-sm); font-weight: 600; color: var(--text)`. `.field-help`: `font-size: var(--fs-xs); line-height: 1.45` |
| `.chip` | `height: 30px; padding: 0 var(--s-3); border-radius: var(--r-pill); border: 1px solid var(--border); background: transparent; font-size: var(--fs-sm); font-weight: 500`. Active: `background: var(--accent); color: var(--accent-contrast); border-color: transparent` |
| `.segmented` | `padding: 4px; border-radius: var(--r-pill); background: var(--surface-2); border: none`. `.segment`: `height: 30px; padding: 0 var(--s-4); border-radius: var(--r-pill); font-weight: 600`. Active: `background: var(--accent); color: var(--accent-contrast)` |
| `.badge` | `border: none; background: var(--surface-3); border-radius: var(--r-pill); padding: 2px 8px; font-weight: 600` |
| `.panel-title` | `font-size: var(--fs-xs); letter-spacing: .06em; margin: 0 0 var(--s-3)` |
| `.item` | `padding: var(--s-2) var(--s-3); border-radius: var(--r-md); border: 1px solid transparent; background: var(--surface-2)`. Hover: `background: var(--surface-3)`. Active: `background: var(--accent-soft); border-color: var(--accent)` |
| `.fieldset` | `border-radius: var(--r-lg); padding: var(--s-4); background: var(--surface); border-color: var(--border)`. The legend is `font-weight: 600; color: var(--text)` |
| `.notice` | `border-radius: var(--r-md); border: 1px solid var(--border); border-left-width: 1px; background: var(--surface-2); padding: var(--s-3) var(--s-4)` with a 4px coloured inset bar via `box-shadow: inset 4px 0 0 var(--warning)`. `.notice.warn` uses `var(--danger)` |
| `.app > .notice` (the app-level status message) | toast: `position: fixed; bottom: var(--s-6); left: 50%; transform: translateX(-50%); z-index: 50; max-width: min(640px, 90vw); box-shadow: var(--shadow-float)` |
| scrollbars | `* { scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent }` |
| `.topbar` | `padding: var(--s-3) var(--s-5); background: var(--bg); border-bottom-color: transparent`. `.top-select` uses the `.input` look at `height: 36px; border-radius: var(--r-pill)` |
| `.panel` | `background: var(--surface); border-left: none; margin: var(--s-3); border-radius: var(--r-lg); padding: var(--s-4) var(--s-5)` |
| keycaps (`keyboard.css`) | `border-radius: 10px`, the gradient becomes `linear-gradient(180deg, var(--keycap-top), var(--keycap))`, `box-shadow: 0 3px 0 var(--keycap-edge), 0 6px 14px var(--keycap-shadow)`. Keep the sizes. `.palette-tile` gets the same radius and shadow |
| `.coffee-link` | `background: var(--surface-2); color: var(--text); border-radius: var(--r-pill)`; hover `background: var(--surface-3)` (drop the hard-coded `#5f7fff`) |

- [ ] **Step 1:** Apply the table.
- [ ] **Step 2:** Run `npm run build && npm test`. Expected: pass.
- [ ] **Step 3: Visual check in the preview** at 1400×860, in dark and then light (toggle the theme): Keymap with key 25 selected, Combos with a combo selected, Behaviors after "+ Hold-tap", Macros, Modules, Screens, Settings, Build, the Keyboard picker, and Print (in print preview it must look light). Screenshot each.
- [ ] **Step 4: Review Focus checks:**
  - Resize to 1024 and then 800 wide: nothing overflows horizontally in the top bar or the panel.
  - Tab through the Keymap page: the focus ring is visible on the buttons, chips, inputs, keys and palette tiles, in both themes.
  - Grep for lime text on light surfaces: `grep -n "var(--accent)" src/ui/styles/*.css | grep -E "(^|[^-])color:"` returns nothing.
- [ ] **Step 5: Commit** with the message "Restyle controls and surfaces for the graphite and lime look".

### Task 5: Finish the phase

- [ ] Run `npm run typecheck && npm run lint && npm test`. Expected: all green.
- [ ] Update the README screenshots: `npm run screenshots` (it needs `npx playwright install chromium` the first time). Commit with the message "Refresh README screenshots".
- [ ] Run `superpowers:requesting-code-review`, then push `ui/foundation` and open a PR against `main` with before and after screenshots in both themes.
