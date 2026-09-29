# nice!view screens

## Why

The editor supported one custom nice!view screen (Gem) as an ordinary module that swapped the shield on every build. whoop-t's [nice-shield-collection](https://github.com/whoop-t/nice-shield-collection) lists many more designs, including art, animations and status screens. Each one follows the same recipe: a west module, a shield that replaces `nice_view` in `build.yaml`, and a few `CONFIG_*` options. Choosing one should be as easy as picking a picture.

## Decisions

- **A Screens tab**, separate from Modules. Big previews don't fit the compact module cards. The Modules page hides screen modules and links to the new tab.
- **One slot per nice!view build.** On a split that means Left and Right, so the halves can show different screens. "Both" puts one screen on every half.
- **In scope:** every plain nice!view design in the collection, plus nice!epaper (a `nice_epaper` shield from the existing nice!oled module).
- **Left out:**
  - nice!view HID: it needs a second module and an app on the computer.
  - Dongle display: it needs a dongle shield.
  - "Create your own": it's a template.
- **Pinned revisions.** The collection doesn't follow ZMK main since its LVGL 9 change. Each module is pinned to a tag, or to the full commit that was current in September 2026, for ZMK v0.3 only. Gem stays on its `v0.3.0` tag, because its `main` branch targets ZMK main.
- **Conflict groups.** Some screens can't share a west workspace, because `west.yml` applies to every half:
  - `nice_view_custom`: the Bongo Cat mod and GPeye's three animations define the same shield.
  - `shield-base`: five whoop-t-based screens each define `SHIELD_NICE_VIEW_SHIELD_BASE` with a different default, so whichever is parsed first wins.
  - `gem-module-name`: Gem and Adventure Time use the same Zephyr module name.

  A screen can go on every half; only two different screens from one group are refused.
- **Options are keyboard-wide.** They live in the `.conf` and apply to every half. `CONFIG_NICE_VIEW_WIDGET_INVERTED` is shared by most screens. A default value removes its line. Removing a module removes its option lines, except the ones another screen still uses.
- **Bundled previews.** Several source GIFs are 10–20 MB, so hotlinking them was not an option. `scripts/gen-screen-previews.mjs` makes small WebPs from each repo's images at the pinned commit. The Space Marine repo has no pictures, so its 1-bit art is drawn from its C source. Every repo is MIT licensed:
  - each card shows the copyright line
  - `public/screens/LICENSES.txt` carries the notice
  - the README has a credits table

## Design

- **Catalog: `src/core/catalog/screens.ts`.**
  - `SCREENS` holds each screen's shield, creator, license, previews, where its art shows, options and conflict group.
  - `SCREEN_MODULES` are the west modules, added to `MODULES` without a `shield`. That way `addModule` doesn't swap every build; the Screens tab does it per half.
  - `SCREEN_SHIELDS` replaces the hardcoded nice!view shield lists in `hardware/config.ts`, `catalog/settings.ts` and `hardware/validate.ts`.
- **Core: `src/core/screens.ts`.**
  - `screenSlots`: the builds that have `nice_view_adapter`. Screens that share a shield are told apart by the module in `west.yml`.
  - `setScreen` / `setScreenEverywhere`: swap the screen shield, add the module, and prune the old one when nothing uses it.
  - `screenConflict`: why a screen can't go on a build.
  - `readScreenOption` / `setScreenOption`: read and write the options.
  - `removeModule` puts the stock screen back on builds that showed one of the module's screens.
- **UI: `ScreensView.tsx`.**
  - A header crediting the collection, with Build & flash.
  - Slot tiles.
  - A card grid with Both / Left / Right toggles; conflicting buttons are disabled with the reason as a tooltip.
  - A details panel with every preview, the credits, and the options once the screen is in use.
- **Firmware check.** `test/screens.test.ts` spreads all screens over `test/generated/screens_1…5` so that no conflicting pair shares a workspace. It builds each screen for both halves. `firmware.yml` compiles them with ZMK, which also proves that several screen modules can live in one workspace.
