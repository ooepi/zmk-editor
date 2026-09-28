# In-app help, README and screenshots: implementation plan

Spec: `docs/specs/2026-09-28-help-and-readme-design.md`.

1. **Shortcuts list.** Add `src/ui/shortcuts.ts`, and a test that reads `App.tsx` and checks every handled key is in the list. The keymap overview uses the list.
2. **Help view.**
   - Add a `'help'` view, a **Help** tab and a **?** button in the top bar.
   - Add a `HelpContext` and a `HelpLink` component.
   - `HelpView` has the table of contents, search with highlighting, and scrolling to the requested section.
3. **Sections.** Write the sections in `src/ui/help/sections/*.tsx`, following the feature inventory.
4. **Help links.** Add "Learn more" links in the keymap, combos, behaviors, macros, modules, settings, build and keyboard views.
5. **Tests.**
   - Help opens from the tab and the ? button.
   - A deep link lands on its section.
   - Search filters sections.
   - The table of contents lists every section.
6. **Screenshots.**
   - Add the `playwright` dev dependency and `scripts/screenshots.ts`, run through `npm run screenshots`.
   - Run it and commit the images in `docs/images/`.
7. **README.** Rewrite it.
8. **Verify.** Run typecheck, lint and tests, then check the Help view in the browser.
