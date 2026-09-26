# ZMK Editor — design spec

Status: approved direction (2026-09-26). The next step is an implementation plan per milestone.

## Why

Neither existing tool covers the full ZMK feature set with a good UI:

- **ZMK Studio** remaps keys live, but only with behaviors already in the firmware. Its docs list encoders, combos, macros, tap-dance, behavior properties and host locale as unsupported. Defining new behaviors is "not planned".
- **nickcoutsos/keymap-editor** handles encoders, combos and macros. But it doesn't build firmware, can't manage modules, and its source is no longer published.

This editor fills the gap. It edits a user's `zmk-config` GitHub repo with a nice UI, supports most ZMK features, has a module ("plugin") catalog and builds firmware through GitHub Actions, ending in downloadable `.uf2` files.

The first user is the repo owner:
- Keyboard: Lily58 (nice!nano v2 + nice!view), one EC11 encoder, mouse keys.
- Config repo: `ooepi/zmk-lily`. A working copy is in `test/fixtures/lily58/`.
- OS: English layout + WinCompose on Windows. ä/ö/å come from `urob/zmk-unicode` in WinCompose mode.

## Product decisions

- **Web app**, static, hosted on GitHub Pages. No backend in v1.
- **Look:** dark, clean, techy, like a modern dev tool.
  - Dark theme by default, with a light theme too.
  - The keyboard is the hero. Keycaps are crisp and legible and show both hold and tap labels.
  - Side panels are compact; the keycode picker is searchable.
- **V1 scope ("solid core"):**
  - layers: add, rename, reorder, delete
  - key bindings through a searchable keycode picker
  - hold-tap and mod-morph
  - encoders: `sensor-bindings` per layer, plus custom `sensor-rotate` behaviors
  - combos and macros
  - module catalog (zmk-unicode with a Finnish/Swedish preset)
  - GitHub: commit → Actions build → `.uf2` download
- **V2:** tap-dance, conditional layers, Kconfig/RGB/BT/sleep settings UI, local file import/export, keyboards beyond the Lily58.

## Architecture

- **Stack:** Vite + React + TypeScript (strict). Vitest for the core logic. The core has no React dependencies (`src/core/`); the UI lives in `src/ui/`.
- **Source of truth:** a structured `KeymapModel` (JSON-serialisable). It holds:
  - layers (name, bindings, sensor-bindings)
  - behaviors (hold-tap, mod-morph, macros, sensor-rotate; tap-dance in v2)
  - combos (and conditional layers in v2)
  - property overrides for existing nodes (e.g. `&mmv { ... }`)
  - modules, includes and defines
  - Kconfig lines
  - a **raw devicetree block** for anything the importer can't understand
- **Generator:** `KeymapModel` → `.keymap`, `.conf`, `west.yml`, workflow, `build.yaml`. The output is deterministic and neatly column-aligned, with ASCII layer comments.
- **Importer:** a best-effort devicetree parser with a minimal preprocessor.
  - The preprocessor handles `#include`, `#define` and the macros of known ZMK headers.
  - Anything the parser can't model goes into the raw block, so nothing is ever silently dropped.
  - Round-trip requirement: import → generate → import produces an equal model. For the Lily58 fixture, the generated firmware must also build.
- **Catalogs** (typed data files in `src/core/catalog/`, easy to extend):
  - behaviors and their parameter types
  - keycodes from ZMK `dt-bindings/zmk/keys.h`, with display labels and aliases
  - modules: each entry lists its `west.yml` project, `#include`s, the behaviors it adds, and ZMK-version compatibility
- **Physical layout:** a built-in Lily58 layout comes first. Later, parse `zmk,physical-layout` from board/shield sources, with a grid fallback.
- **Version safety:** a single "ZMK version" selector (e.g. `v0.3`) pins the workflow `@ref`, the `zmk` revision and all module revisions *together*.
  - Background: `zmk-lily` broke because the workflow used `@main` while `west.yml` pinned `v0.2` and `zmk-helpers` used `main`. The editor must make that mismatch impossible.
- **GitHub (v1):**
  - Auth: a fine-grained PAT pasted by the user and kept in localStorage. It needs Contents RW and Actions R.
  - Commit through the Git Data API (blobs → tree → commit → ref update).
  - Poll the workflow run for that commit, then download the artifact zip and unzip it in the browser (`fflate`).
  - Offer each `.uf2` for download. Offer "write to keyboard" through the File System Access API where supported.
- **GitHub (v2):** a GitHub App with a small Cloudflare Worker for the OAuth code exchange.

## Known risks (spike early)

1. **Artifact download CORS.** The artifact URL redirects to blob storage, which may block cross-origin reads from the browser. Fallbacks: link to the run's artifact page, or proxy through a Worker.
   - **Resolved (2026-09-26):** the spike workflow (`.github/workflows/artifact-cors-spike.yml`) downloaded an artifact from a browser page on another origin with a token, and got a 200 from Azure blob storage. The editor still falls back to the run page plus a drop-in zip if a download is ever blocked.
2. **Importer coverage** for arbitrary user keymaps. The raw block keeps this safe.

## Milestones

1. Scaffold: Vite/React/TS, lint, Vitest, GitHub Pages deploy workflow.
2. `KeymapModel` + generator + importer, with round-trip tests on `test/fixtures/lily58/`.
3. Layout canvas + layer/binding editing (keycode picker).
4. Editors for behaviors, combos, macros and encoders.
5. Module catalog (zmk-unicode Finnish/Swedish preset, WinCompose/macOS/Linux mode).
6. GitHub connect → commit → build → `.uf2` download.

## Verification

- Unit tests: the generator is deterministic, and import → generate → import is stable on the fixture.
- CI build check: push the generated Lily58 config to a test branch of a zmk-config repo. The GitHub Actions build must pass. Known-good reference: `ooepi/zmk-lily` branch `feat/unicode-wincompose`, all pinned to `v0.3`.
- End-to-end: edit a key in the UI → commit → build → download `.uf2` → flash → the key works.
