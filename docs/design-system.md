# Design system

The editor's look comes from one set of **tokens** and one set of **shared controls**. New UI is built from these, so it matches the rest of the app without any styling of its own. The look changes in one place.

See it live: run `npm run dev` and open **http://localhost:5173/#design**. That page shows every token and control in both themes, rendered with the production classes.

## Where things live

| File | What it holds |
|---|---|
| `src/ui/styles/tokens.css` | All tokens. **The only file with raw colours.** |
| `src/ui/styles/base.css` | Page defaults: font, body, focus ring, scrollbars |
| `src/ui/styles/controls.css` | Shared controls: buttons, fields, chips, segments, lists, badges, notices |
| `src/ui/styles/<area>.css` | Layout and context tweaks for one part of the app (shell, keyboard, palette, …) |
| `src/ui/styles/index.css` | Imports everything in cascade order |
| `src/ui/designSystem/DesignSystemPage.tsx` | The living reference at `/#design` |

## Tokens: three layers

1. **Palette.** Raw values that don't depend on the theme: `--graphite-900`, `--lime-300`, `--blue-600`, … To rebrand, change these.
2. **Scales and component tokens.** Also theme-independent:
   - radius `--r-sm|md|lg|pill`
   - spacing `--s-1…--s-8` (4px steps)
   - type `--fs-xs…--fs-2xl`
   - motion `--dur-fast`, `--ease-out`
   - small component tokens such as `--toggle-sun` and `--print-paper`
3. **Semantic roles, one set per theme.** These say what a colour is *for*: `--bg`, `--surface`, `--surface-2`, `--surface-3`, `--border`, `--text`, `--text-muted`, `--accent`, `--accent-line`, `--accent-text`, `--accent-soft`, `--focus-ring`, `--danger`, `--success`, `--warning`, `--info`, the key colours `--key-*`, the behavior-kind colours `--kind-*`, and the shadows `--shadow-*`. The dark block is the default; the light block overrides it. The print sheet always uses the light one.

**Components use layers 2 and 3 only, never the palette.** That is what lets one edit to `tokens.css` restyle the whole app, and lets a theme swap every colour at once.

The accent comes in three strengths, because lime is too pale to read on a light background:
- `--accent`: **fills** only (primary buttons, active chips and tabs, highlights).
- `--accent-line`: **lines that mark state**, such as a selected key's ring, an active item's border, a tab underline or a drop indicator. It reaches at least 3:1 against every surface in both themes.
- `--accent-text`: accent-coloured **text**. It reaches at least 4.5:1.

`src/ui/styles/contrast.test.ts` checks those contrast ratios from `tokens.css`. It also fails if a border, outline, box-shadow or underline uses the fill `--accent`.

## Rules

These rules are enforced by `src/ui/styles/tokens.test.ts`, which runs with `npm test`:

- No raw colours (`#hex`, `rgb()`, `hsl()`) in any stylesheet except `tokens.css`.
- No palette tokens (`--lime-300`, …) outside `tokens.css`.
- Borders, outlines, rings and underlines use `--accent-line`, never the fill `--accent` (`contrast.test.ts`).

These are by convention:

- Take spacing, radius and font sizes from the scales rather than inventing pixel values.
- Build with the shared classes first (`button`, `button primary`, `icon-button`, `input`, `chip`, `segmented`/`segment`, `item`, `badge`, `fieldset`, `notice`). An area file should only add layout or context tweaks, such as `.toolbar .button { … }`.
- Use at most one `button primary` per view: the one action that matters most.

## Recipes

**Add a colour**
1. If you need a new raw value, add a palette entry in `tokens.css`.
2. Add a semantic role to **both** the dark and the light blocks, e.g. `--kind-combo`.
3. Add the role to `COLOUR_GROUPS` in `DesignSystemPage.tsx`.

**Add a shared control**
1. Add the class to `controls.css` (or a React primitive in `src/ui/components/ui/` that renders shared classes), using tokens only.
2. Add a section to `DesignSystemPage.tsx` showing it, with its states: default, hover-able, active, disabled.
3. Check `/#design` in both themes.

**Restyle something everywhere.** Change the token, or the control in `controls.css`, not the place where it is used.
