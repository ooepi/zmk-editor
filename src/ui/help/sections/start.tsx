import { See, Sub, Ui, type HelpSection } from './common.tsx';

export const START: HelpSection[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    body: (
      <>
        <p>
          ZMK Editor edits a <a href="https://zmk.dev" target="_blank" rel="noreferrer">ZMK</a> keyboard config in your
          browser: the keymap, combos, macros, behaviors, modules and settings. It can also describe a keyboard you built
          yourself. When you're done, it commits the files to your <code>zmk-config</code> repository on GitHub, and
          GitHub Actions builds the firmware (<code>.uf2</code>) for you to flash.
        </p>
        <Sub id="first-steps" title="First steps">
          <ol>
            <li>
              The editor opens with a <strong>Lily58 demo</strong>. Try things out on it; nothing leaves your browser until
              you commit.
            </li>
            <li>
              To use your own keyboard, either open your files with <Ui>Open files</Ui> in the top bar's <Ui>⋯</Ui> More menu, connect your
              repository on the <Ui>Build &amp; flash</Ui> tab and choose <Ui>Load config from repo</Ui>, or start from ZMK's default
              keymap for your keyboard on the Keyboard page (the keyboard button at the top left). To look at someone
              else's public config, use <Ui>Open from GitHub</Ui>; see <See to="open-github">below</See>.
            </li>
            <li>Edit the keymap. Everything can be undone with Ctrl+Z.</li>
            <li>
              On the <Ui>Build &amp; flash</Ui> tab, review the changes and press <Ui>Commit &amp; build</Ui>. When the build is done,
              download the firmware or write it straight onto the keyboard. See{' '}
              <See to="building">Building and flashing</See>.
            </li>
          </ol>
        </Sub>
        <Sub id="open-files" title="Opening and downloading files">
          <p>
            These live in the <Ui>⋯</Ui> More menu at the top right. <Ui>Open files</Ui> takes your <code>.keymap</code> and, optionally, its <code>.conf</code>,{' '}
            <code>west.yml</code>, <code>build.yaml</code> and <code>.editor.json</code>. Pick them together. The keyboard
            is named after the <code>.keymap</code> file. Files you don't pick keep what the editor had. Opening files
            replaces the editor's contents and clears the undo history.
          </p>
          <p>
            <Ui>Download .keymap</Ui> saves just the keymap. <Ui>Download config (.zip)</Ui> saves a complete{' '}
            <code>zmk-config</code>: the keymap, <code>.conf</code>, <code>west.yml</code>, <code>build.yaml</code>, the
            GitHub build workflow and, for a keyboard you designed, its shield files. <Ui>Reset to demo</Ui> goes back to
            the Lily58 demo.
          </p>
          <p>
            Some parts of a keymap the editor can't edit visually, such as complex preprocessor code. These are kept as
            written, and are listed under <strong>Import notes</strong> in the side panel of the Keymap tab.
          </p>
        </Sub>
        <Sub id="open-github" title="Opening a public repository">
          <p>
            <Ui>Open from GitHub</Ui> in the top bar opens any public <code>zmk-config</code> repository without logging
            in: paste <code>owner/repo</code> or its GitHub link (a link to a branch, <code>…/tree/branch</code>, opens
            that branch), and optionally a <Ui>Branch</Ui>. It replaces the editor's contents, after asking. It only
            reads: to commit your changes, connect to your own repository on the Build &amp; flash tab. GitHub allows about 60
            requests an hour without logging in, so opening many repositories in a row can hit that limit for a while.
          </p>
        </Sub>
        <Sub id="print" title="Printing a cheat sheet">
          <p>
            <Ui>Print keymap</Ui> in the top bar shows every layer as a keyboard diagram, plus your combos, ready to print.
            Untick layers or combos you don't want, then press <Ui>Print</Ui>. To get a PDF instead of paper, choose
            “Save as PDF” in the print dialog. The sheet prints on plain white, with no backgrounds, so it only uses ink for the key outlines and labels,
            two layers to a page.
          </p>
        </Sub>
        <Sub id="saving" title="What is saved where">
          <ul>
            <li>
              <strong>Your config</strong> is saved in this browser after every change, so a reload keeps your work. It is
              only in your GitHub repository after you commit on the Build &amp; flash tab.
            </li>
            <li>
              <strong>Preferences</strong> (theme, recently used palette keys, layout variants, Unicode languages) are
              saved in this browser.
            </li>
            <li>
              <strong>Your GitHub login or token</strong> is kept for this session only, unless you ticked{' '}
              <Ui>Stay logged in on this device</Ui> or <Ui>Remember on this device</Ui>.
            </li>
            <li>The undo history, the key clipboard and the selection are not saved.</li>
          </ul>
        </Sub>
        <Sub id="zmk-version" title="ZMK version">
          <p>
            The <Ui>ZMK v0.3</Ui> selector in the top bar chooses the ZMK release the firmware is built with. Changing it
            also moves every module to its matching release and updates the build workflow. If a module has no release
            for the version you pick, the editor says so; remove that module on the <Ui>Modules</Ui> tab first.
          </p>
        </Sub>
      </>
    ),
  },
];
