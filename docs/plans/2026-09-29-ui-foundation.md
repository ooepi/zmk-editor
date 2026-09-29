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
- **Design-system rule:** raw colour values (`#hex`, `rgb()`, `hsl()`) live only in `tokens.css`. Every other stylesheet uses semantic tokens. A test enforces this (Task 5).
- Tokens have two layers. The **palette** holds raw, theme-independent values; the **semantic** layer holds per-theme roles such as `--surface` and `--accent`. Components use semantic tokens only, never palette ones.

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

- [ ] **Step 3: Replace `tokens.css` entirely.** It has three layers: the palette, then theme-independent scales, then per-theme semantic roles.

```css
/*
 * Design tokens: the only place raw colours live (enforced by tokens.test.ts).
 * 1. Palette: raw values, theme-independent. Rebrand here.
 * 2. Scales: radius, spacing, type, motion. Theme-independent.
 * 3. Semantic roles per theme: what components use. Never use palette tokens outside this file.
 * See docs/design-system.md.
 */

/* 1. Palette */
:root {
  --graphite-950: #121212;
  --graphite-900: #1b1b1d;
  --graphite-850: #202023;
  --graphite-800: #242427;
  --graphite-750: #29292d;
  --graphite-700: #2e2e32;
  --graphite-650: #36363b;
  --graphite-600: #404046;
  --graphite-500: #55555b;
  --graphite-300: #9a9a94;
  --graphite-50: #f1f1ee;
  --paper-0: #ffffff;
  --paper-50: #f4f4f0;
  --paper-100: #efefeb;
  --paper-150: #e8e8e3;
  --paper-200: #dcdcd5;
  --paper-250: #d2d2cb;
  --paper-300: #c4c4bc;
  --paper-400: #b3b3ab;
  --paper-600: #62625c;
  --paper-900: #17171a;
  --lime-300: #d7f46c;
  --lime-500: #a8cc2a;
  --lime-800: #4f6a00;
  --lime-950: #1a1f05;
  --blue-300: #7aa7ff;
  --blue-600: #2f6fe0;
  --amber-300: #f5b86b;
  --amber-700: #b86a0b;
  --violet-300: #c792ea;
  --violet-700: #8a3fc4;
  --pink-300: #f38ba8;
  --pink-700: #c2386b;
  --cyan-300: #67d8ef;
  --cyan-700: #0f8aa3;
  --red-300: #ff6b6b;
  --red-600: #d43d3d;
  --green-300: #6ee7a8;
  --green-700: #1f9d5c;

  /* 2. Scales */
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
}

/* 3. Semantic roles: dark (default) */
:root,
:root[data-theme='dark'] {
  --bg: var(--graphite-950);
  --surface: var(--graphite-900);
  --surface-2: var(--graphite-800);
  --surface-3: var(--graphite-700);
  --border: var(--graphite-700);
  --border-strong: var(--graphite-600);
  --text: var(--graphite-50);
  --text-muted: var(--graphite-300);
  --accent: var(--lime-300);
  --accent-text: var(--lime-300);
  --accent-soft: color-mix(in srgb, var(--lime-300) 13%, transparent);
  --accent-contrast: var(--lime-950);
  --danger: var(--red-300);
  --danger-soft: color-mix(in srgb, var(--red-300) 12%, transparent);
  --success: var(--green-300);
  --warning: var(--amber-300);
  --info: var(--blue-300);
  --keycap: var(--graphite-850);
  --keycap-top: var(--graphite-750);
  --keycap-edge: var(--graphite-650);
  --keycap-shadow: rgb(0 0 0 / 50%);
  --key-layer: var(--blue-300);
  --key-hold: var(--amber-300);
  --key-macro: var(--violet-300);
  --key-dim: var(--graphite-500);
  --kind-holdtap: var(--amber-300);
  --kind-modmorph: var(--pink-300);
  --kind-tapdance: var(--cyan-300);
  --kind-encoder: var(--blue-300);
  --kind-macro: var(--violet-300);
  --kind-module: var(--graphite-300);
  --shadow-sm: 0 2px 5px rgb(0 0 0 / 35%);
  --shadow-md: 0 8px 24px rgb(0 0 0 / 25%);
  --shadow-inset: inset 0 2px 4px rgb(0 0 0 / 25%);
  --shadow-float: 0 10px 30px rgb(0 0 0 / 35%), inset 0 1px 0 rgb(255 255 255 / 4%);
  color-scheme: dark;
}

/* 3. Semantic roles: light. The printed cheat sheet is always light, whatever the screen theme. */
:root[data-theme='light'],
.print-sheet {
  --bg: var(--paper-100);
  --surface: var(--paper-0);
  --surface-2: var(--paper-50);
  --surface-3: var(--paper-150);
  --border: var(--paper-200);
  --border-strong: var(--paper-300);
  --text: var(--paper-900);
  --text-muted: var(--paper-600);
  --accent: var(--lime-500);
  --accent-text: var(--lime-800);
  --accent-soft: color-mix(in srgb, var(--lime-500) 18%, transparent);
  --accent-contrast: var(--lime-950);
  --danger: var(--red-600);
  --danger-soft: color-mix(in srgb, var(--red-600) 10%, transparent);
  --success: var(--green-700);
  --warning: var(--amber-700);
  --info: var(--blue-600);
  --keycap: var(--paper-0);
  --keycap-top: var(--paper-0);
  --keycap-edge: var(--paper-250);
  --keycap-shadow: rgb(30 30 20 / 12%);
  --key-layer: var(--blue-600);
  --key-hold: var(--amber-700);
  --key-macro: var(--violet-700);
  --key-dim: var(--paper-400);
  --kind-holdtap: var(--amber-700);
  --kind-modmorph: var(--pink-700);
  --kind-tapdance: var(--cyan-700);
  --kind-encoder: var(--blue-600);
  --kind-macro: var(--violet-700);
  --kind-module: var(--paper-600);
  --shadow-sm: 0 2px 5px rgb(30 30 20 / 12%);
  --shadow-md: 0 8px 24px rgb(30 30 20 / 10%);
  --shadow-inset: inset 0 2px 4px rgb(30 30 20 / 10%);
  --shadow-float: 0 10px 30px rgb(30 30 20 / 10%), 0 1px 2px rgb(30 30 20 / 6%);
  color-scheme: light;
}
```

- [ ] **Step 4: Accent as text becomes `--accent-text`.** Run `sed -i -E 's/(^|[^-])color: var\(--accent\)/\1color: var(--accent-text)/' src/ui/styles/*.css`, then `grep -nE "(^|[^-])color: var\(--accent\)" src/ui/styles/*.css`. Expected: no matches (about 11 were replaced). Then replace the remaining raw colours outside `tokens.css`:
- the old teal `rgb(94 224 193 / 12%)` with `var(--accent-soft)`
- `rgb(255 107 107 / 12%)` with `var(--danger-soft)`
- the three `rgb(0 0 0 / …)` box-shadows with `var(--shadow-md)`, `var(--shadow-inset)` and `var(--shadow-sm)`
- the coffee link's `#5f7fff`/`#4d6dee` (restyled in Task 4)

Task 5's test then guards the rule.
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

### Task 5: Make the design system self-maintaining

**Files:**
- Create: `src/ui/styles/tokens.test.ts`, `src/ui/designSystem/DesignSystemPage.tsx`, `src/ui/designSystem/DesignSystem.test.tsx`, `docs/design-system.md`
- Modify: `src/ui/App.tsx` (render the page on `#design`, lazily)

**Interfaces:**
- Produces: `DesignSystemPage`, a default export for `React.lazy`, taking no props. Later phases add a section to it for each new primitive.

- [ ] **Step 1: Write the guard test** (`src/ui/styles/tokens.test.ts`):

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(import.meta.dirname);
const RAW_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/i;

describe('design tokens', () => {
  const sheets = readdirSync(DIR).filter((f) => f.endsWith('.css') && f !== 'tokens.css');

  it.each(sheets)('%s uses tokens, not raw colours', (file) => {
    const offending = readFileSync(join(DIR, file), 'utf8')
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => RAW_COLOUR.test(line));
    expect(offending, 'Move the colour into tokens.css as a semantic token').toEqual([]);
  });

  it('components use semantic tokens, not the palette', () => {
    for (const file of sheets) {
      expect(readFileSync(join(DIR, file), 'utf8')).not.toMatch(/var\(--(graphite|paper|lime|blue|amber|violet|pink|cyan|red|green)-\d+\)/);
    }
  });
});
```

- [ ] **Step 2:** Run `npx vitest run src/ui/styles/tokens.test.ts`. Expected: PASS, because Task 3 removed the raw colours. If it fails, the listed lines show what's left; move each one into a token.
- [ ] **Step 3: Write the page test first** (`src/ui/designSystem/DesignSystem.test.tsx`):

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DesignSystemPage from './DesignSystemPage.tsx';

describe('design system page', () => {
  it('shows the token swatches and every base control', () => {
    render(<DesignSystemPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Design system' })).toBeTruthy();
    for (const section of ['Colours', 'Type', 'Radius and spacing', 'Buttons', 'Fields', 'Chips and segments', 'Lists', 'Notices', 'Keycaps']) {
      expect(screen.getByRole('heading', { level: 2, name: section })).toBeTruthy();
    }
    expect(screen.getByText('--accent')).toBeTruthy();
  });
});
```

Run it and expect it to fail, because the module does not exist yet.

- [ ] **Step 4: Implement `DesignSystemPage.tsx`.** It is an `<article className="design-system">` with an `<h1>Design system</h1>` and one `<section>` with an `<h2>` per heading in the test. Its content:
  - **Colours:** a grid of swatches from a `SEMANTIC_TOKENS` array (`'--bg', '--surface', '--surface-2', '--surface-3', '--border', '--text', '--text-muted', '--accent', '--accent-soft', '--danger', '--success', '--warning', '--info', '--key-layer', '--key-hold', '--key-macro', '--kind-holdtap', '--kind-modmorph', '--kind-tapdance', '--kind-encoder', '--kind-macro'`). Each swatch shows a `<code>` with the name and a box with `style={{ background: \`var(${name})\` }}`.
  - **Type:** one sample line per `--fs-*` size, plus a mono sample.
  - **Radius and spacing:** boxes for each `--r-*`, and bars for each `--s-*`.
  - **Components:** real markup using the production classes. Buttons: `.button`, `.button.primary`, `.button.danger`, disabled, `.icon-button`, `.link-button`. Fields: `.field` with `.field-label`, `.input`, `select.input`, `.field-help` and `.field-error`, plus a checkbox. Chips and segments: `.chips`/`.chip` (one `.active`) and `.segmented`/`.segment`. Lists: `.item-list`/`.item` (one `.active`) and `.badge`. Notices: `.notice` and `.notice.warn`. Keycaps: a few `.palette-tile` elements with the `kind-*` classes.
  - A theme toggle at the top, reusing `useTheme` and `ThemeToggle`.

  Add `.design-system` layout rules (grid, gaps, swatch size) to a new `src/ui/styles/design-system.css`, imported last in `index.css`. Use tokens only.
- [ ] **Step 5: Wire it into the app.** In `App.tsx`, add `const DesignSystemPage = lazy(() => import('./designSystem/DesignSystemPage.tsx'));` and a `useHash()` check. When `location.hash === '#design'`, render `<Suspense fallback={null}><DesignSystemPage /></Suspense>` instead of the editor. Add a `hashchange` listener so it updates live. It is lazy, so the normal editor bundle doesn't grow.
- [ ] **Step 6:** Run `npm test`. Expected: all pass, including the two new files.
- [ ] **Step 7: Write `docs/design-system.md`** (short):
  - the three token layers and where they live
  - "Add a colour": palette entry, then a semantic role in both themes, then the swatch list in `DesignSystemPage`
  - "Add a component": a class in `controls.css` (or a primitive in `src/ui/components/ui/`), then a section on the page
  - the rules: no raw colours outside `tokens.css`, which the test enforces; components use semantic tokens; spacing and radius come from the scales
  - how to view it (`npm run dev`, then open `/#design`)
- [ ] **Step 8:** Check the page in the preview (`/#design`) in both themes and screenshot it. Commit with the message "Design system: token guard test, living reference page at #design, docs".

### Task 6: Finish the phase

- [ ] Run `npm run typecheck && npm run lint && npm test`. Expected: all green.
- [ ] Update the README screenshots: `npm run screenshots` (it needs `npx playwright install chromium` the first time). Commit with the message "Refresh README screenshots".
- [ ] Run `superpowers:requesting-code-review`, then push `ui/foundation` and open a PR against `main` with before and after screenshots in both themes.
