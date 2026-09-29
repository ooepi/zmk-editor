/** A keyboard or mouse shortcut, for the Help page and the keymap overview. */
export interface Shortcut {
  /** How to do it, e.g. "Ctrl+Z" or "Ctrl+click a key". */
  keys: string;
  action: string;
  /** Where it works. */
  where: string;
  /** The `KeyboardEvent.key` values the app's shortcut handler reacts to for this, if any. */
  handles?: string[];
}

export const SHORTCUTS: Shortcut[] = [
  { keys: 'Ctrl+Z', action: 'Undo', where: 'Everywhere except the keyboard wizard', handles: ['z'] },
  { keys: 'Ctrl+Shift+Z or Ctrl+Y', action: 'Redo', where: 'Everywhere except the keyboard wizard', handles: ['z', 'y'] },
  { keys: 'Esc', action: 'Deselect keys and stop placing an armed palette tile', where: 'Everywhere', handles: ['Escape'] },
  { keys: 'Ctrl+A', action: 'Select every key', where: 'Keymap', handles: ['a'] },
  { keys: 'Ctrl+C', action: 'Copy the selected keys', where: 'Keymap', handles: ['c'] },
  { keys: 'Ctrl+X', action: 'Cut the selected keys (they become transparent)', where: 'Keymap', handles: ['x'] },
  { keys: 'Ctrl+V', action: 'Paste keys', where: 'Keymap', handles: ['v'] },
  { keys: 'Delete or Backspace', action: 'Make the selected keys transparent', where: 'Keymap', handles: ['Delete', 'Backspace'] },
  { keys: 'Ctrl+click or Shift+click a key', action: 'Add the key to the selection, or remove it', where: 'Keymap' },
  { keys: 'Drag a box on empty space', action: 'Select the keys inside it (hold Ctrl to add to the selection)', where: 'Keymap, Designer' },
  { keys: 'Drag a key onto another key', action: 'Swap them (hold Alt or Ctrl while dropping to copy)', where: 'Keymap' },
  { keys: 'Hold a drag over a layer', action: 'Switch to that layer, then drop on a key to copy it there', where: 'Keymap' },
  { keys: 'Drag a layer', action: 'Reorder layers', where: 'Keymap' },
  { keys: 'Alt+↑ or Alt+↓ on a layer', action: 'Move the layer up or down', where: 'Keymap' },
  { keys: 'Double-click a layer', action: 'Rename the layer', where: 'Keymap' },
  { keys: 'Enter in a key search', action: 'Pick the first result', where: 'Keycode picker, behavior field' },
  { keys: 'Arrow keys (Shift: 1 key)', action: 'Move the selected keys by ¼ key', where: 'Designer, keyboard wizard' },
];
