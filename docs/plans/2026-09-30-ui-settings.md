# UI overhaul, Phase 5 (settings): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Settings page stops showing all 54 settings at once:
- A left nav lists the 8 groups, each with an icon and a "3 changed" counter. Only the chosen group shows.
- Each group lists its everyday settings; the rare ones sit behind "Show N advanced settings".
- A **Changed only** filter shows every modified setting on one screen.
- "Raw .conf" is the last nav entry.

**Architecture:**
- **Catalog data** (`src/core/catalog/settings.ts`):
  - `SettingDef` gains `advanced?: true`.
  - `SETTING_GROUPS` entries gain an `icon` name.
  - `SettingWarning` gains `setting: string`, the setting it's about, so the banner can link to that setting's group.
  - Nothing that reads or writes the `.conf` changes.
- **View** (`SettingsView.tsx`):
  - `SettingsNav`: groups, Changed only and Raw .conf.
  - `SettingsGroup`: title, description, basic rows, then the advanced toggle.
  - `SettingRow`: label and help on the left, the control on the right.
  - `ChangedOnly`: the changed rows under their group headings.
  - `RawConf` stays as it is.
- **Rows:**
  - Booleans are a `Switch`; numbers are compact inputs with a unit suffix; choices are selects.
  - A changed row gets a lime left marker, a "Changed" badge and a reset icon button.
  - "Default: …" moves into the help line. Milliseconds show a readout ("5 min").
  - Unavailable hardware stays greyed out.
- **Warnings banner:** stays at the top. Each warning names its group with a link that opens it, next to the existing Turn on / Turn off fix.
- **Icons:** add zap, bluetooth, battery, mouse-pointer and usb (Lucide), then restyle `styles/settings.css`.

**Spec:** `docs/specs/2026-09-29-ui-overhaul-design.md`, "Phase 5: Settings". Branch `ui/settings` from `main`.

## Global Constraints

- The generated `.conf` is unchanged; this is presentation only.
- Keep the accessible names:
  - the regions named after each group (`Power & sleep` …)
  - `Reset … to default`
  - the setting labels (`Idle after (ms)` …)
  - `Setting problems`, `.conf file`, `Apply`
- Booleans become `role="switch"`, so `Settings.test.tsx` queries `switch` instead of `checkbox`.
- An advanced setting that's already changed is never hidden: its group opens with the advanced settings shown.
- Tokens only; the token and contrast tests stay green. Run tests with `npx vitest run --maxWorkers=6`, and restart the preview before handing over.

## Review Focus

1. Every setting is reachable: by its group, by Changed only once it's set, and after a warning's link.
2. The counters, Changed only and the lime markers all agree on what "changed" means (the value is set in the `.conf`).
3. Advanced settings: the toggle count is right, and changed advanced settings aren't hidden.

---

### Task 1: Catalog data (TDD)
- `advanced: true` on: transmit power, simultaneous connections, experimental connection and security, passkey, enforce GATT subscription, clear pairings on start, underglow external power, the underglow minimum brightness and step sizes, encoder processing, smooth scrolling, key roll-over (NKRO), media keys usages and USB logging.
- Group icons, and `setting` on every warning.
- Tests in `settings.test.ts`:
  - every group has at least one basic setting
  - the flagged names are exactly the list above
  - every warning names a known setting
- Commit.

### Task 2: Icons
- zap, bluetooth, battery, mousePointer and usb in `Icon.tsx`. Commit together with Task 3.

### Task 3: Two-pane Settings
- The nav, group view, rows, advanced toggle, Changed only and Raw .conf as described above.
- The warning banner links to groups; the default group is Power & sleep.
- Update `Settings.test.tsx` to open a group before finding its settings, and to use `switch`.
- New tests: the counters, the advanced toggle (its count, and that changed advanced settings show), Changed only across groups, and a warning's link opening its group.
- Commit.

### Task 4: Verify
- typecheck, lint and the full test suite.
- The preview in dark and light, at 1400 and ~1024 wide, and a keyboard walk through the nav.
- A raw `.conf` round-trip.
- One fresh whole-branch review, then hand over for you to try.
