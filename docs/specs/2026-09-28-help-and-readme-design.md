# In-app help, README revamp and screenshots

## Why

The editor has grown well past its first version, but the README still describes that first version, and nothing in the app explains features like the palette, box select, copy/paste across layers, the hardware wizard or the Build tab. New users have to discover everything by trying it.

## Decisions

### Help view
- **Opening it:** a **Help** view tab (after Build) and a **?** button in the top bar open it.
- **Layout:** a sticky table of contents on the left and the guide on the right. On narrow screens the table of contents becomes a select.
- **Search:** a box that hides sections not containing every typed word, and highlights the matches. Highlighting uses the CSS Custom Highlight API; where it isn't supported, filtering still works.
- **Sections:**
  1. Getting started: what the editor does, the demo, opening files, what is saved where.
  2. Editing keys: the side panel, palette, several keys, copy/paste, dragging between layers, encoders.
  3. Layers: including conditional layers.
  4. Combos.
  5. Behaviors: hold-tap, mod-morph, tap-dance, encoder behaviors, module behaviors.
  6. Macros.
  7. Modules.
  8. Settings.
  9. Building and flashing.
  10. Your own keyboard: Keyboard view, Designer, hardware wizard.
  11. Keyboard shortcuts.
  12. Troubleshooting and FAQ.
- **Deep links:** `HelpLink` ("Learn more") links in the keymap overview, palette, combos, behaviors, macros, modules, settings, build and keyboard views open Help at the right section. They use a React context, so components don't need extra props.
- **Shortcuts, one source:** `src/ui/shortcuts.ts` lists every shortcut. The Help table and the keymap overview both use it. A test reads `App.tsx` and fails if a key it handles is missing from the list.
- **Where the content lives:** `src/ui/help/`, one file per section, using the app's exact labels.

### README
- **Contents:** pitch, a link to the live app (`https://ooepi.github.io/zmk-editor/`), screenshots, features in plain words, a quick start, and a pointer to in-app Help.
- **Updated sections:** development, project layout, and deploying.
- **Removed:** the "early development" status line and the milestone plan link.

### Screenshots
- **Script:** `npm run screenshots` builds the app, serves it with Vite's preview server, and uses Playwright (a dev dependency) with headless Chromium.
- **Captures:** five PNGs in `docs/images/`: keymap with palette, several keys selected, the hold-tap editor, layout designer, and Help. (The Build view needs a real GitHub account to show anything, so it isn't captured.)
- **Settings:** dark theme, 1400×860 viewport, and a fresh demo config (empty storage).
- **Browser download:** `npx playwright install chromium` downloads the browser once. It is not committed.

## Out of scope

Translations, video tutorials, and a first-run tour.
