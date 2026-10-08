# Handoff: shift registers (74HC595) in the keyboard wizard

Start here in a fresh session.

## Where things are

- **Repo:** `D:\fffff\zmk-editor`. The folder `D:\zmk-editor` is an old, stale snapshot with a broken `.git`; never work there.
- **Branch:** `feat/shift-registers`, made from `origin/main` at `5095d03`. Nothing is pushed yet.
- **Spec (approved by the user):** `docs/specs/2026-10-08-shift-registers-design.md`
- **Plan (written, waiting for the user's review and choice of execution method):** `docs/plans/2026-10-08-shift-registers.md`. It has 8 TDD tasks with exact code, plus a "Review Focus" list.
- **Commits so far:** the spec, a spec update (own bus next to a nice!view), and the plan. No product code yet.

## What's decided

- **Scope:** one-piece matrix keyboards only; the 74HC595 only, chained 1–4 deep (8–32 outputs).
- **Approach A:** a driven matrix line (columns on col2row, rows on row2col) can be a D-pin, no pin, or a shift register output `{ "sr": n }`. Turning shift registers on fills lines 0, 1, 2… with outputs 0, 1, 2…
- **Pins:** latch (RCLK, chip select, active low), data (SER/MOSI), clock (SRCLK/SCK). Data and clock default to the controller's nice!view SPI pins (Pro Micro D2/D3, XIAO D10/D8).
- **With a nice!view:** the shift registers share its bus by default (two chip selects, 595 as device 1, no `nice_view_adapter`). A checkbox, "Shift registers on their own pins" (`ownBus`), gives them a separate bus.
- **Own bus:** `&spi2` at 1 MHz (no clash with I2C, so an OLED keeps working).
- **File format:** version 3, written only for keyboards that have shift registers.

## Next steps

1. Ask the user to review the plan, if they haven't, and to choose **subagent-driven** or **native** execution. The previous session recommended native: the tasks share types tightly, and the tests (including the Subsata reference tests and the ZMK firmware fixtures) are thorough.
2. Run the plan with `superpowers:executing-plans` (native) or `superpowers:subagent-driven-development`.
3. Afterwards: push the branch, open a PR, and check that the "Firmware build check" workflow builds the three new fixtures in `test/generated/editor_shift*`.

## Useful facts

- **Checks:** `npm run typecheck`, `npm run lint`, `npx vitest run`. Snapshot fixtures are updated with `npx vitest run test/customKeyboards.test.ts -u` (only for the new fixtures; existing ones must not change).
- **Shell:** Windows; the Bash tool's heredocs lose backslashes, so write scripts to files instead of inline Python.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Reference shields** (hand-written, proven on hardware): `ooepi/zmk-config-grstn-subsata`.
  - `boards/shields/subsata` (v1: own buses).
  - `boards/shields/subsata_v2` (v2: shared bus), in PR #2 there.
  - The plan's golden tests describe both boards and compare the generated output with them.
- **The user:** a software engineer, not an electronics engineer. They prefer plain explanations and diagrams.
