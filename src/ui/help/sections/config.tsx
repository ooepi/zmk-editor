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
          widget, nice!oled widgets and ZMK helpers. Filter them by kind, or show only <Ui>Installed</Ui>. nice!view
          screens have their own tab: see <strong>nice!view screens</strong>.
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
    id: 'screens',
    title: 'nice!view screens',
    body: (
      <>
        <p>
          The <Ui>Screens</Ui> tab changes what a nice!view shows: status screens like Gem, Battery and Elemental, or art
          like Luffy, Futurama, Space Marine and Mario. The designs come from{' '}
          <a href="https://github.com/whoop-t/nice-shield-collection" target="_blank" rel="noopener noreferrer">
            whoop-t’s nice-shield-collection
          </a>
          , and each card names the person who made it, links to their repository and shows its license.
        </p>
        <p>
          Every build with a nice!view gets a slot (<strong>Left</strong> and <strong>Right</strong> on a split). Use{' '}
          <Ui>Both</Ui>, <Ui>Left</Ui> or <Ui>Right</Ui> on a card to choose where it goes; halves can show different
          screens. <Ui>Back to stock</Ui> puts ZMK’s own screen back. The editor adds the screen’s module to{' '}
          <code>west.yml</code> (pinned to a version tested with ZMK v0.3), swaps the shield in <code>build.yaml</code>{' '}
          and removes the module again once no half uses it. Then <Ui>Build &amp; flash</Ui> puts it on the keyboard.
        </p>
        <Sub id="screen-options" title="Options and limits">
          <p>
            Click a preview to see more pictures and the screen’s options (animation speed, inverted colors…). Options
            are saved in your <code>.conf</code>, so they apply to every half. Some screens share internal names and
            can’t be on the same keyboard at once (for example two of the peripheral animations); the card says so and
            the button is greyed out, but one of them can still go on every half. A few draw art only on the peripheral
            half and look like the stock screen on the central one.
          </p>
          <p>
            The screens need ZMK v0.3: the collection’s designs don’t work with ZMK’s newer display library yet.
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
          The <Ui>Settings</Ui> tab edits your keyboard's <code>.conf</code> file with plain descriptions. Pick a group on
          the left (power and sleep, Bluetooth, battery and split, RGB underglow, backlight, display, encoders and
          pointing, keyboard and USB) to see its settings; each group shows how many you've changed. Rarely needed
          settings sit under <Ui>Show advanced settings</Ui>. Empty fields use ZMK's default, shown in the help under
          each setting; changed ones are marked, and the reset button next to one returns it to the default.{' '}
          <Ui>Changed only</Ui> lists every setting you've changed, across all groups. Settings take effect after you
          build and flash.
        </p>
        <p>
          At the top, the editor warns about settings that don't match your keymap or keyboard, for example mouse keys
          on a key while pointing is off, or underglow on a keyboard without LEDs, with a link to the group and a button
          to fix each. <Ui>Raw .conf</Ui> lets you edit the file as text.
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
          The <Ui>Build &amp; flash</Ui> tab commits your config to GitHub, where GitHub Actions builds the firmware. It needs a{' '}
          <code>zmk-config</code> repository on GitHub: pick one you have, or let the editor create one.
        </p>
        <Sub id="connect" title="Connecting to GitHub">
          <p>
            <Ui>Log in with GitHub</Ui> asks GitHub which repositories the editor may use; it reads and commits files and
            follows builds there, and can create a new repository for you. Or open <Ui>Use a token instead</Ui> and paste a
            fine-grained personal access token for just that repository, with <strong>Contents: read and write</strong>,{' '}
            <strong>Actions: read</strong> and <strong>Workflows: read and write</strong>. Pick the repository and branch
            and open it. <Ui>Load config from repo</Ui> replaces the editor's contents with what's in the repository.
          </p>
          <p>
            No repository yet? <Ui>New repository</Ui> creates one on your GitHub account, commits this config to it and
            starts the first build. An empty repository you made on GitHub works too: the first commit fills it. After
            adding repositories on GitHub, <Ui>Refresh list</Ui> shows them without reloading the page.
          </p>
          <p>
            The editor remembers the repository and reopens it by itself next time, and rereads the branch whenever you
            open this tab, so the list of changes always matches GitHub.
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
