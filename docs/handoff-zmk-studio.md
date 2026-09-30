# Handoff: ZMK Studio live mode for ZMK Editor

Written 2026-09-30 at the end of a long session. It's for the Claude session that builds the next feature. Read it first, then `docs/design-system.md`.

## Where the project is

- **The app.** ZMK Editor is a browser app (React 19 + TypeScript, Vite 8, vitest + testing-library/jsdom). It edits a ZMK keyboard config (keymap, combos, behaviors, macros, modules, nice!view screens, Kconfig settings), then commits it to the user's GitHub zmk-config repo and follows the GitHub Actions build. Deployed at https://ooepi.github.io/zmk-editor/. The repo is `ooepi/zmk-editor`.
- **Recent work.** A full UI overhaul (graphite + lime design system) and a polish round are done: PRs #31 to #41. #41 (loose ends) may still be open; check `gh pr view 41`.
- **Build & flash**:
  - It remembers and reopens the repo on its own (`src/ui/state/buildSession.ts`, held in `App`).
  - It can create a repo: the GitHub App has the Administration permission.
  - It handles empty repos, shows readable build failures, and puts a pending-changes badge on its tab.

## How the user likes to work (important)

- **Process.** A short plan first, then the user approves it, then you build it in-session. After the build, one fresh whole-branch review by a general-purpose agent, fix everything it finds, restart the preview, and hand it over to try.
- **Pushing.** Push and open a PR **only** when the user says so (usually "push and create a PR"). One PR per feature, branched from `main`, with a plan in `docs/plans/` and, for big features, a spec in `docs/specs/`.
- **Feedback.** They give visual feedback with screenshots and like quick `show_widget` mockups when choosing between layouts.
- **Writing.** Plain, concrete language in the UI and PR descriptions. PR bodies list what changed, the checks, and anything deferred.

## Commands and environment gotchas (Windows)

- **Tests:** `npx vitest run --maxWorkers=6`, never the default run, which times out. `npm run typecheck` (tsc -b) and `npm run lint` (eslint; check the exit code, since empty output is easy to misread as a pass).
- **Preview:** `.claude/launch.json` config **`dev-5174`**. Port 5173 is often taken by another session. After script-driven edits, **restart the preview** (preview_stop + preview_start): Vite sometimes caches a half-written module and shows a blank page.
- **Screenshots:** the pane often times out. Use a scratch Playwright script against `http://localhost:5174` instead, importing `file:///D:/fffff/zmk-editor/node_modules/playwright/index.mjs`, as `scripts/screenshots.ts` does. `npm run screenshots` refreshes the README images from a production build.
- **Scripted edits:**
  - Files are CRLF in the working copy (`core.autocrlf=true`). In Python, open files with `newline=''` and keep their endings. `src/ui/styles/contrast.test.ts` normalises CRLF.
  - Python heredocs mangle `\n` and `\u` escapes in TS strings. Use the Edit tool for those.
- **Prettier:** there is no Prettier config. Only format *new* files, with `--single-quote --print-width 130`.
- **Design rules** (enforced by tests):
  - Raw colours live only in `tokens.css`. Use semantic tokens.
  - Lines use `--accent-line`, and text uses `--accent-text` or `--*-text`.
  - No `outline: none` on `:focus-visible`.
  - New shared controls go on the `/#design` page.
  - UI primitives: `Dialog`, `Switch`, `Section`, `Badge`, `IconButton`, `Menu`, `NumberInput` in `src/ui/components/ui/`.
- **Accessible names are the test contract.** Tests query by role and name; keep names stable.

## The next feature: a ZMK Studio "live mode"

**Agreed with the user.** Build it as a *try-it-instantly layer* on top of the normal commit → build → flash flow, not a replacement. The user noted Studio can't do about half of what the editor does.

**What Studio is** (verify against primary sources before designing): ZMK firmware can include an RPC protocol, "ZMK Studio", that a client uses over USB serial (Web Serial) or BLE. From what we know, it can:
- read the physical layout and the behaviors compiled into the firmware
- get and set the binding of any key on any layer
- add, remove, rename and move layers
- save changes to the keyboard's flash, or discard them
- lock and unlock, with a `&studio_unlock` key

**It can't** create or edit combos, macros, hold-tap, mod-morph or tap-dance definitions or their properties, conditional layers, Kconfig settings or modules. Those still need a build.

**The flow we sketched**:
1. **Enable it once.** The editor turns Studio on in the firmware: a Kconfig setting (likely `CONFIG_ZMK_STUDIO=y`), plus a build option (likely a `snippet: studio-rpc-usb-uart` in `build.yaml` for USB). It suggests adding a `&studio_unlock` key. The user builds and flashes as usual.
2. **Connect.** A "Connect keyboard" control (top bar) uses Web Serial, which works only in Chromium on desktop; explain this in other browsers. While connected, key and layer edits on the Keymap tab are also sent to the keyboard straight away.
3. **Limits.** Edits Studio can't apply show "needs a build"; Build & flash is unchanged.

**Pitfalls to design for**:
- **Two sources of truth.** Studio's changes live on the keyboard, not in the repo. Keep the repo as the truth, and write live edits into the editor state as well, so the next commit contains them.
- **Stale keyboard keymaps.** After flashing a new build, a keymap saved on the keyboard by Studio overrides the firmware's keymap until reset. Offer "Reset the keyboard to this build's keymap" after a build, or users will think their changes didn't take effect.
- **Mapping behaviors.** Studio uses behavior IDs and parameter metadata from the device. Map them to the editor's `Binding` (`{ behavior: 'kp', params: ['A'] }`) by behavior name or compatible. Custom behaviors (hold-taps and so on) only exist on the device if they were in the flashed build.
- **Unlocking.** The keyboard must be unlocked (the `&studio_unlock` key) before writes.
- **Security (CSP).** `vite.config.ts` sets a CSP. Web Serial needs no `connect-src`, but check it if a library loads anything.

**To research first** (with the `research` skill or primary sources):
- The official client library, probably `@zmkfirmware/zmk-studio-ts-client` on npm, and the protocol's `.proto` files: which RPCs exist and their exact names.
- The exact Kconfig and snippet names, and which ZMK versions support Studio. The editor pins ZMK `v0.3` by default; see `ZMK_VERSIONS` in `src/core/catalog/modules.ts`.
- Which boards and shields need a physical layout (`zmk,physical-layout`) for Studio. The editor already writes these for custom keyboards.

**Where things are in this codebase**:
- **Config model and file generation:** `src/core/config.ts` (`generateConfig`, `importConfig`); `src/core/files/build.ts` (`build.yaml`); `src/core/files/kconfig.ts`.
- **Settings catalogue:** `src/core/catalog/settings.ts` (`SETTINGS`, `SETTING_GROUPS`, the `ADVANCED` set). A Studio toggle could live here or in a new section.
- **Keymap model:** `src/core/keymap/model.ts`, with `Binding`, `Layer`, `Behavior`. Labels come from `display.ts` (`describeBinding`), and behavior metadata from `src/core/catalog/behaviors.ts` (`BUILTIN_BEHAVIORS`, `behaviorCatalog`).
- **Editor state and undo:** `src/ui/state/editorReducer.ts`. Every edit goes through `dispatch`; a live-mode sync could observe `setBinding`, `placeOnKey`, layer actions and so on.
- **App shell:** `src/ui/App.tsx` (views, tabs, top bar and `KeyboardButton`) and `src/ui/components/Toolbar.tsx`.
- **The Keymap tab:** `KeyboardCanvas.tsx`, `LayerRail.tsx`, `BindingPanel.tsx`, `KeyPalette.tsx`.
- **A pattern to copy:** `useBuildSession()` in `buildSession.ts` is the model for an app-level, async session with a generation guard against stale results. A `useStudioSession()` could follow it.

**Suggested start:**
1. Use superpowers:brainstorming with the user on scope: USB only at first? Which edits sync? What happens on disconnect?
2. Research the protocol and client library.
3. Write a spec in `docs/specs/` and a plan in `docs/plans/`.
4. Get approval before building.
