import { Sub, Ui, type HelpSection } from './common.tsx';

export const KEYBOARD: HelpSection[] = [
  {
    id: 'your-keyboard',
    title: 'Your keyboard',
    body: (
      <>
        <p>
          The keyboard name button at the top left opens the Keyboard page. It shows which keyboard this config is for and
          how its keys are drawn.
        </p>
        <Sub id="new-config" title="Starting from a keyboard in ZMK">
          <p>
            Under <Ui>Start a new config</Ui>, search ZMK's list of keyboards (Corne, Sofle, Kyria…), pick one, choose its{' '}
            <Ui>Controller</Ui> and press <Ui>Create config for …</Ui>. The editor starts from ZMK's default keymap for it.
            This replaces what's in the editor; your repository is untouched until you commit.
          </p>
          <p>
            If a keyboard has several layouts (such as ANSI and ISO), choose yours with <Ui>Layout</Ui>. Keyboards the
            editor doesn't know are drawn as a grid.
          </p>
        </Sub>
        <Sub id="designer" title="Layout designer">
          <p>
            <Ui>Open layout designer</Ui> changes where keys are drawn, not how they're wired. Drag keys (they snap to ¼
            key) or select them and use the arrow keys; Ctrl+click or drag a box to move several together. Set exact
            positions, sizes and rotation in the side panel, or start from a template. <Ui>Save layout</Ui> stores it as{' '}
            <code>config/info.json</code>, committed with your config.
          </p>
        </Sub>
        <Sub id="wizard" title="Designing your own keyboard">
          <p>
            Built a keyboard yourself, or designing a PCB? <Ui>Design your own keyboard</Ui> describes it in four steps, and
            the editor writes the ZMK files (a shield) for it:
          </p>
          <ol>
            <li>
              <Ui>Basics</Ui>: name, controller (a wireless nRF52840 board: Pro Micro-sized such as the nice!nano, or the
              smaller Seeed XIAO nRF52840 with 11 pins), split or one piece, and wiring: a matrix with diodes (rows × columns)
              or one pin per key.
            </li>
            <li>
              <Ui>Wiring</Ui>: which controller pin each row, column or key is soldered to (click a field, then a pin on the
              diagram), plus encoders and displays (nice!view or OLED, on their standard pins or any you choose). On a split, the right half is a mirror of the left
              unless you say otherwise.
            </li>
            <li>
              <Ui>Layout</Ui>: where each key sits and which row and column it's wired to. Add or delete keys here.
            </li>
            <li>
              <Ui>Review</Ui>: problems to fix, and the files the editor will write.
            </li>
          </ol>
          <p>
            Later, <Ui>Edit hardware</Ui> on the Keyboard page reopens the wizard. Undo and opening files are paused while
            the wizard is open.
          </p>
        </Sub>
      </>
    ),
  },
];
