import { See, Sub, Ui, type HelpSection } from './common.tsx';

export const BEHAVIORS: HelpSection[] = [
  {
    id: 'combos',
    title: 'Combos',
    body: (
      <>
        <p>
          A combo sends something when you press several keys together, for example J+K for Esc. On the{' '}
          <Ui>Combos</Ui> tab:
        </p>
        <ol>
          <li>
            <Ui>+ New combo</Ui> creates one.
          </li>
          <li>
            Click keys on the keyboard to add them to the combo, or remove them (it needs at least two). The keyboard
            shows the base layer here.
          </li>
          <li>
            Under <Ui>Sends</Ui>, choose what it does, just like editing a key.
          </li>
          <li>
            Optionally limit it to some <Ui>Layers</Ui>; with none selected it works on every layer.
          </li>
        </ol>
        <p>
          <Ui>Timeout (ms)</Ui> is how quickly all its keys must be pressed. <Ui>Require prior idle (ms)</Ui> stops the
          combo from firing while you're typing fast. <Ui>Slow release</Ui> keeps it held until all its keys are released.
        </p>
      </>
    ),
  },
  {
    id: 'behaviors',
    title: 'Behaviors',
    body: (
      <>
        <p>
          On the <Ui>Behaviors</Ui> tab you create your own key types. Each gets a name you use on keys (as{' '}
          <code>&amp;name</code>); you'll find them under <strong>Your behaviors</strong> in the behavior field and the
          palette. Renaming updates every key that uses it; deleting one makes those keys do nothing.
        </p>
        <Sub id="hold-tap" title="Hold-tap">
          <p>
            One thing when tapped, another when held, such as home row mods. Choose the <Ui>Hold behavior</Ui> and{' '}
            <Ui>Tap behavior</Ui> (usually key press or layer), then put it on a key and pick the hold and tap values
            there. Under <Ui>Settings</Ui>, <Ui>Flavor</Ui> decides how a press is read when another key comes in
            between, and <Ui>Tapping term</Ui> is how long a press can be and still count as a tap. Empty settings use
            ZMK's defaults.
          </p>
        </Sub>
        <Sub id="mod-morph" title="Mod-morph">
          <p>
            A key that sends something else while a modifier is held, for example , normally and ; with Shift. Set{' '}
            <Ui>Normally</Ui>, <Ui>With modifier</Ui> and which modifiers trigger it (<Ui>Morph on</Ui>).
          </p>
        </Sub>
        <Sub id="tap-dance" title="Tap-dance">
          <p>
            Sends something different for 1, 2, 3… taps. Set what each number of taps sends; add more with{' '}
            <Ui>+ Add tap</Ui>, and reorder them by dragging the ⋮⋮ grip or with ↑ and ↓. <Ui>Tapping term</Ui> is how
            long it waits for another tap.
          </p>
        </Sub>
        <Sub id="encoder-behavior" title="Encoder behavior">
          <p>
            Turns an encoder into a binding per direction (<Ui>Clockwise</Ui>, <Ui>Counter-clockwise</Ui>), for example
            scrolling or switching windows. Pick it on an encoder in the Keymap tab.
          </p>
        </Sub>
        <Sub id="module-behaviors" title="Behaviors from modules">
          <p>
            Some modules add their own kinds: <strong>leader key</strong> sequences, <strong>adaptive keys</strong> and
            the <strong>tri-state</strong> (Alt-Tab swapper). Their templates appear on the module's card on the Modules
            tab once it's added. Behaviors the editor doesn't know are shown as <Ui>Source</Ui> text you can edit. See{' '}
            <See to="modules">Modules</See>.
          </p>
        </Sub>
      </>
    ),
  },
  {
    id: 'macros',
    title: 'Macros',
    body: (
      <>
        <p>
          A macro sends a sequence of keys from one key press. On the <Ui>Macros</Ui> tab, <Ui>+ New macro</Ui> creates
          one. Then:
        </p>
        <ul>
          <li>
            Type text into <Ui>Type text, e.g. Hello!</Ui> and press <Ui>Add text</Ui> to turn it into key steps
            (characters without a key on a US layout are skipped, and listed).
          </li>
          <li>
            Add single steps with <Ui>+ Key</Ui>, <Ui>+ Press mode</Ui>, <Ui>+ Release mode</Ui>, <Ui>+ Tap mode</Ui>{' '}
            and <Ui>+ Wait time</Ui>. Press mode holds the following keys down until a release step, which is how you
            send, say, Ctrl+Shift+T as separate steps.
          </li>
          <li>Click a step to edit it. Drag the ⋮⋮ grip or use ↑ and ↓ to reorder; ✕ removes it.</li>
        </ul>
        <p>
          Put the macro on a key from <strong>Your behaviors</strong> in the behavior field, or from the palette.
        </p>
      </>
    ),
  },
];
