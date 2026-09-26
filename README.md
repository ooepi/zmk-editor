# ZMK Editor

A web-based editor for [ZMK](https://zmk.dev) keyboard configs. It edits your `zmk-config` repo on GitHub, supports the features ZMK Studio doesn't (encoders, combos, macros, modules like Unicode ä/ö/å), and builds your firmware with GitHub Actions so you can download the `.uf2`.

Status: early development. See [the design spec](docs/specs/2026-09-26-zmk-editor-design.md) and [the current plan](docs/plans/2026-09-26-milestones-1-2.md).

## Development

Requires Node 22.

```sh
npm install
npm run dev        # start the app
npm test           # unit + fixture tests
npm run lint
npm run typecheck
npm run build      # production build in dist/
```

## Layout

- `src/core/` — framework-free logic: devicetree parser/printer (`dts/`), the keymap model with its importer and generator (`keymap/`), `.conf` / `west.yml` / `build.yaml` / workflow files (`files/`), keyboard layouts (`layouts/`) and the whole-repo API (`config.ts`). It must not import React.
- `src/ui/` — the React app.
- `worker/` — the "Log in with GitHub" helper (Cloudflare Worker).
- `test/fixtures/lily58/` — a real, working Lily58 config.
- `test/generated/lily58/` — what the editor generates from that fixture. The tests fail if it goes stale (update with `npx vitest run -u`), and `.github/workflows/firmware.yml` builds it with ZMK to prove it compiles.

## Deploying

`.github/workflows/pages.yml` deploys `main` to GitHub Pages. Enable it under Settings → Pages → Source: GitHub Actions. Pages on a private repo needs a paid GitHub plan.

"Log in with GitHub" needs a GitHub App and a small login helper on Cloudflare Workers ([`worker/`](worker)). See [docs/github-login-setup.md](docs/github-login-setup.md). Without it, the Build tab uses a personal access token instead.
