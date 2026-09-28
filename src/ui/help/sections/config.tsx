import { Sub, Ui, type HelpSection } from './common.tsx';

export const CONFIG: HelpSection[] = [
  {
    id: 'modules',
    title: 'Modules',
    body: (
      <>
        <p>
          Modules add features to ZMK that aren't built in. The <Ui>Modules</Ui> tab lists tested ones: Unicode (type ä, ö,
          å and other characters), auto layer (num-word), leader key, adaptive keys, tri-state, an RGB LED status
          widget, nice!view Gem, nice!oled widgets and ZMK helpers. Filter them by kind, or show only{' '}
          <Ui>Installed</Ui>.
        </p>
        <p>
          <Ui>Add</Ui> puts a module in <code>west.yml</code> at the release that matches your ZMK version, adds its
          includes and turns on what it needs in your <code>.conf</code>. Its behaviors then appear under{' '}
          <strong>From modules</strong> when you edit a key. <Ui>Remove</Ui> takes it out again; keys that used it will
          do nothing. If a module is pinned to a different release than your ZMK version, the editor warns you and{' '}
          <Ui>Follow ZMK</Ui> fixes it: mixed versions are the most common reason builds break.
        </p>
        <Sub id="unicode" title="Unicode characters">
          <p>
            With the Unicode module added, a key's behavior can be <strong>Unicode</strong>: type the character (ä) or
            search by name. Your computer needs a matching input method, chosen on the module's card (WinCompose, macOS,
            Linux…). The <Ui>Finnish/Swedish preset</Ui> puts ä, ö and å first.
          </p>
        </Sub>
        <Sub id="find-modules" title="Finding more modules">
          <p>
            <Ui>Find more modules on GitHub</Ui> searches repositories tagged <code>zmk-module</code>, or checks one you
            paste as <code>owner/repo</code>. <Ui>Details</Ui> shows what it provides; <Ui>Add to west.yml</Ui> adds it.
            These modules aren't checked by the editor, so only add ones you trust.
          </p>
        </Sub>
      </>
    ),
  },
  {
    id: 'settings',
    title: 'Settings',
    body: (
      <>
        <p>
          The <Ui>Settings</Ui> tab edits your keyboard's <code>.conf</code> file with plain descriptions: power and sleep,
          Bluetooth, battery and split, RGB underglow, backlight, display, encoders and pointing, and keyboard and USB
          options. Empty fields use ZMK's default, shown in the help under each field; <Ui>reset</Ui> empties a field
          again. Settings take effect after you build and flash.
        </p>
        <p>
          At the top, the editor warns about settings that don't match your keymap or keyboard, for example mouse keys
          on a key while pointing is off, or underglow on a keyboard without LEDs, with a button to fix each.{' '}
          <Ui>Edit the .conf file directly</Ui> lets you edit the file as text.
        </p>
      </>
    ),
  },
  {
    id: 'building',
    title: 'Building and flashing',
    body: (
      <>
        <p>
          The <Ui>Build</Ui> tab commits your config to GitHub, where GitHub Actions builds the firmware. You need a{' '}
          <code>zmk-config</code> repository on GitHub, for example one made from ZMK's template.
        </p>
        <Sub id="connect" title="Connecting to GitHub">
          <p>
            <Ui>Log in with GitHub</Ui> asks GitHub which repositories the editor may use; it can read and commit files and
            follow builds there, nothing else. Or open <Ui>Use a token instead</Ui> and paste a fine-grained personal
            access token for just that repository, with <strong>Contents: read and write</strong>,{' '}
            <strong>Actions: read</strong> and <strong>Workflows: read and write</strong>. Pick the repository and branch
            and open it. <Ui>Load config from repo</Ui> replaces the editor's contents with what's in the repository.
          </p>
        </Sub>
        <Sub id="commit" title="Committing and building">
          <p>
            <Ui>Changes to commit</Ui> lists every file that differs from the branch; click one to see the changes. The
            first commit reformats your keymap, and comments inside it aren't kept. Write a <Ui>Commit message</Ui> and
            press <Ui>Commit &amp; build</Ui>. The editor follows the build and downloads the firmware when it's done,
            usually in a few minutes. <Ui>Latest build</Ui> fetches the newest build without committing.
          </p>
          <p>
            If something would make the build fail, such as a problem in a keyboard you designed or settings for
            hardware your keyboard doesn't have, the editor lists it and won't commit until it's fixed.
          </p>
        </Sub>
        <Sub id="flashing" title="Flashing the keyboard">
          <ol>
            <li>Double-tap the reset button on the keyboard (on a split, on one half). A drive such as NICENANO appears.</li>
            <li>
              Press <Ui>Write to keyboard…</Ui> and pick that drive (Chrome and Edge), or <Ui>Download</Ui> the{' '}
              <code>.uf2</code> and copy it onto the drive. Use the left file for the left half.
            </li>
            <li>The keyboard restarts with the new firmware. Repeat for the other half.</li>
          </ol>
          <p>
            If your browser blocks the firmware download, download the <strong>firmware</strong> artifact from the build
            page on GitHub and open the zip with <Ui>Open firmware zip</Ui>.
          </p>
        </Sub>
      </>
    ),
  },
];
