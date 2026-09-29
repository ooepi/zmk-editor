import { See, Sub, Ui, type HelpSection } from './common.tsx';

export const KEYS: HelpSection[] = [
  {
    id: 'editing-keys',
    title: 'Editing keys',
    body: (
      <>
        <p>
          The <Ui>Keymap</Ui> tab shows your keyboard for the selected layer. Each key shows what it sends; a small line
          underneath shows what it does when held, or what kind of key it is (for example <code>mo</code> for a layer
          key, <code>sticky</code> for a sticky key).
        </p>
        <Sub id="side-panel" title="The side panel">
          <p>Click a key to select it. The side panel on the right then shows:</p>
          <ul>
            <li>
              <Ui>Behavior</Ui>: what kind of key it is. Click the field or start typing to search, for example "tap",
              "layer" or "bluetooth"; use the arrow keys and Enter, or click. Each behavior has a short description.
            </li>
            <li>
              The behavior's settings. A key press has a <Ui>Value</Ui>; a mod-tap has <Ui>Hold (modifier)</Ui> and{' '}
              <Ui>Tap</Ui>; a layer-tap has <Ui>Hold (layer)</Ui> and <Ui>Tap</Ui>. Clicking a key value opens the key
              picker: search ("esc", "volume", "!"), filter by category, and add modifiers such as <Ui>Ctl</Ui> or{' '}
              <Ui>Sft</Ui> to send, say, Ctrl+C.
            </li>
            <li>
              <Ui>Source</Ui>: the key as ZMK code, like <code>&amp;kp LC(A)</code>. Edit it directly if you know ZMK;
              press Enter to apply. It turns red if it can't be read.
            </li>
            <li>
              <Ui>Transparent</Ui> (▽) uses whatever the layer below has on that key; <Ui>None</Ui> (✕) does nothing.
            </li>
          </ul>
          <p>Click the key again, click empty space or press Esc to deselect it.</p>
        </Sub>
        <Sub id="palette" title="The key palette">
          <p>
            Under the keyboard is the palette: every key and behavior as a tile. There are three ways to use it:
          </p>
          <ul>
            <li>
              <strong>Drag</strong> a tile onto a key.
            </li>
            <li>
              <strong>Select keys first</strong>, then click a tile: it goes on all of them.
            </li>
            <li>
              <strong>Click a tile with nothing selected</strong> to arm it (it lights up), then click keys to place it on
              each. Press Esc or click the tile again to stop. This is also the way to use the palette on a touch screen.
            </li>
          </ul>
          <p>
            <Ui>Keys</Ui> has the same search and categories as the key picker. The <Ui>+Ctl</Ui>, <Ui>+Sft</Ui>…
            chips add modifiers to the keys you place. <Ui>Behaviors</Ui> has ready-made tiles for layer keys (one per
            layer), Bluetooth, mouse, lighting, system keys and your own behaviors and macros, with a search box.{' '}
            <Ui>Recent</Ui> remembers the last 16 tiles you used; <Ui>Clear</Ui> empties it.
          </p>
          <p>
            Placing a <strong>key</strong> on a hold-tap keeps the hold and changes only the tap: a key that is Shift when
            held and A when tapped becomes Shift/B when you drop B on it. To make it a plain key again, drop a tile from
            the Behaviors tab first or change its behavior in the side panel. A <strong>behavior</strong> tile replaces
            the whole key.
          </p>
        </Sub>
        <Sub id="several-keys" title="Selecting several keys">
          <ul>
            <li>Ctrl+click (or Shift+click) keys to add or remove them.</li>
            <li>Drag a box on empty space around the keys to select everything it touches. Hold Ctrl to add to the selection.</li>
            <li>Ctrl+A selects every key; Esc, or a click on empty space, clears the selection.</li>
          </ul>
          <p>
            With several keys selected, the side panel shows <Ui>N keys selected</Ui>. Clicking a palette tile,{' '}
            <Ui>Transparent</Ui>, <Ui>None</Ui> or pressing Delete changes all of them at once, as one undo step. The
            selection stays when you switch layers.
          </p>
        </Sub>
        <Sub id="clipboard" title="Copy and paste">
          <p>
            Ctrl+C copies the selected keys, Ctrl+X cuts them (they become transparent), Ctrl+V pastes. The{' '}
            <Ui>Copy</Ui>, <Ui>Cut</Ui> and <Ui>Paste</Ui> buttons in the side panel do the same.
          </p>
          <ul>
            <li>
              <strong>One copied key</strong> is pasted onto every selected key.
            </li>
            <li>
              <strong>Several copied keys</strong> are pasted into the same positions on the layer you're looking at. This
              is how you copy, say, the thumb keys or a whole half to another layer: select them, Ctrl+C, switch layer,
              Ctrl+V.
            </li>
          </ul>
          <p>
            Pasting several keys onto the layer they came from would change nothing, so the editor asks you to switch
            layer instead.
          </p>
        </Sub>
        <Sub id="drag-keys" title="Dragging keys">
          <ul>
            <li>Drag a key onto another to swap them. Hold Alt (or Ctrl) while dropping to copy instead.</li>
            <li>
              To move a key to another layer, drag it and hold it over that layer's tab for a moment. The layer opens;
              drop the key where you want it. It's copied, so the original stays.
            </li>
          </ul>
        </Sub>
        <Sub id="encoders" title="Encoders (knobs)">
          <p>
            If your keyboard has encoders, they appear under the keyboard showing what they do each way (↺ and ↻) on the
            current layer. Click one to edit it in the side panel. From the palette, drop a key on the ↺ or ↻ side to set
            that direction; Transparent and None apply to both. For anything more than one key each way, such as
            scrolling, create an <Ui>Encoder behavior</Ui> on the Behaviors tab and pick it here. See{' '}
            <See to="behaviors">Behaviors</See>.
          </p>
        </Sub>
      </>
    ),
  },
  {
    id: 'layers',
    title: 'Layers',
    body: (
      <>
        <p>
          Your layers are listed beside the keyboard; layer 0 is the base layer. Click a layer to show it. Point at a
          layer, or move to it with Tab, to show its drag handle and its <Ui>✎</Ui> and <Ui>🗑</Ui> buttons.
        </p>
        <ul>
          <li>
            <Ui>+</Ui> under the list adds a layer (all transparent) and lets you name it. Double-click a layer, or use
            its <Ui>✎</Ui>, to rename it.
          </li>
          <li>
            Drag a layer by its handle, or press Alt+↑ or Alt+↓ on it, to reorder layers. Keys that switch layers keep
            pointing at the same layer.
          </li>
          <li>
            A layer's <Ui>🗑</Ui> deletes that layer. Keys that switched to it will do nothing, and combos that only
            worked on it are removed.
          </li>
        </ul>
        <p>
          To switch layers from the keyboard, put a layer key on it: <strong>Momentary layer</strong> (<code>&amp;mo</code>
          , active while held), <strong>Layer-tap</strong> (<code>&amp;lt</code>, a layer when held and a key when tapped),{' '}
          <strong>Toggle layer</strong> (<code>&amp;tog</code>), <strong>To layer</strong> (<code>&amp;to</code>) or{' '}
          <strong>Sticky layer</strong> (<code>&amp;sl</code>). The palette's Behaviors tab has one tile per layer for
          each. Make sure every layer has a way back to the base layer.
        </p>
        <Sub id="conditional-layers" title="Conditional layers">
          <p>
            A conditional layer turns on by itself while several other layers are on, for example Lower + Raise = Adjust.
            With no key selected, the side panel shows <Ui>Conditional layers</Ui>: add one with{' '}
            <Ui>+ Conditional layer</Ui> (it needs at least three layers), choose the layers that must be on, and the layer
            to turn on.
          </p>
        </Sub>
      </>
    ),
  },
];
