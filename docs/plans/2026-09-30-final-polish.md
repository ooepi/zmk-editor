# Final polish: build status, readable build errors, first visit, loose ends

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Two PRs from `main`: **C** (`ui/final-polish`) adds three things; **D** (`ui/loose-ends`) clears the deferred minors from PRs #32–#37 and trims the first load.

## PR C: three small features

### C1: Build & flash shows what's pending
- **Core.** `pendingChanges(config, repoFiles)` in `src/core/github/changes.ts`: the files to write or delete, as `BuildView` computes them today. `BuildView` and `App` both use it.
- **Tab.** The Build & flash tab shows a small count badge ("3") while connected with uncommitted changes. While a build runs it shows a spinner dot, then a green check when the firmware is ready, or red when the build failed.
  - The accessible name stays "Build & flash".
  - The state goes in `aria-describedby` text ("3 changes to commit", "Building…").
- **Tests:** the count after an edit, zero after a commit, and the building and ready states.

### C2: Why a build failed
- **Core.** `buildFailure(client, ref, runId)` in `builds.ts`:
  - reads `/actions/runs/{id}/jobs`: the failed jobs, each job's failed step and its log URL
  - reads each failed job's annotations
  - tries `/actions/jobs/{id}/logs`, and when that works, keeps the lines that matter (`error:`, `devicetree error`, `undefined reference`, `FATAL`, `Kconfig` warnings that stop the build), at most 12
  - never throws, because the log is optional
- **Hints by failed step:**
  - "West Update": a module or revision in `west.yml` couldn't be fetched
  - "Fetch Build Keyboards": `build.yaml` is invalid
  - "West Build": ZMK couldn't compile the config
- **Hints by error line:** a devicetree label or undefined node, a Kconfig symbol, or a behavior that isn't compiled in.
- **UI.** The failed Build section lists each failed half ("Build ZMK firmware (lily58_left)"), the failed step, the hint, the error lines in a mono block, and "Open this log on GitHub".
- **Tests:** a fake run with failed jobs, with the log readable and with it blocked.

### C3: A first-visit card
- A "Get started" section at the top of the Keymap details panel, shown until it's dismissed. The flag lives in `preferences.ts`.
- **Three choices:**
  - **Pick your keyboard** opens the Keyboard page.
  - **Open your config** opens Build & flash.
  - **Keep exploring the demo** dismisses the card.
- It isn't a modal, so nothing is blocked. It says the demo is a Lily58 and that nothing leaves the browser until you commit.
- **Tests:** shown on the first visit, gone after dismissing or choosing, and gone for anyone who already has a config.

## PR D: loose ends
- **Undo.** Edits from one number field coalesce into one undo step. `edit` and `editConfig` get an optional `mergeKey`, and a following action with the same key replaces the current state instead of pushing history. Used by PropertyFields numbers, Settings ints and the tapping term field.
- **Combos (#34):**
  - Focus goes to the combo's card after Done, and into the editor after + New combo.
  - The formula shows how a layer key works (`mo`/`tog`/`lt` as a small tag).
  - A blocked Done shows its message once.
  - Remove the leftover `aria-pressed` on list buttons.
  - An identical toast in quick succession restarts its timer.
- **Palette (#33):**
  - The folded status line doesn't say "click a tile".
  - Esc stops placing even from the search box.
  - Focus follows a rail jump.
  - The two "System" rail entries get distinct names.
  - Only the changing part of the status is announced.
  - Raw pixel values become tokens.
- **Shell (#32):**
  - Build & flash stays reachable at 800px.
  - Long layer names are capped with an ellipsis and a title.
  - Opening the GitHub popover closes the More menu, and the reverse.
  - `aria-orientation` follows the rail's direction.
  - A scrolled rail keeps its card edges.
- **Settings (#36):** the advanced toggle is remembered per group, and the nav's "N changed" label doesn't wrap.
- **Help (#37):** scrolled to the bottom, the marker goes to the last section. Also remove the dead `.print-controls .fieldset`.
- **Bundle:** the keyboard catalogue, the screens catalogue and the Help view load on demand, clearing Vite's 500 kB warning.

## Verification (both)
- Typecheck, lint and `npx vitest run --maxWorkers=6`.
- Playwright screenshots of the changed places in dark and light.
- One fresh whole-branch review per PR.
- Hand over to try, then push and open the PR.
