import { useEffect, type Dispatch } from 'react';
import { keycodeForCode, MODIFIER_CODES, SPECIAL_CODES } from '../../core/keymap/typedKey.ts';
import type { EditorAction } from './editorReducer.ts';
import { usePreferences } from './preferences.ts';

/** Text being typed somewhere else, or a dialog. A switch (such as the typing switches themselves) doesn't count. */
function ignored(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio')) return target.closest('dialog') !== null;
  return target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName) || target.closest('dialog') !== null;
}

/**
 * Puts the key pressed on the computer's keyboard on the selected keys, one key at a time:
 * held modifiers are ignored, and a modifier pressed and released on its own is placed.
 * Ctrl/Cmd combinations stay the editor's and browser's shortcuts. Esc, Backspace, Delete,
 * Tab, Enter and Space keep their jobs unless "Type all keys" is on.
 */
export function useTypeKeys(enabled: boolean, dispatch: Dispatch<EditorAction>): void {
  const { typeAdvance, typeAllKeys } = usePreferences();
  useEffect(() => {
    if (!enabled) return;
    // A modifier that went down with no other key or click since; placed when it comes back up.
    // A click cancels it, so Ctrl/Shift-click to select more keys doesn't place the modifier.
    let lone: string | null = null;
    const click = () => {
      lone = null;
    };
    const down = (event: KeyboardEvent) => {
      if (ignored(event.target)) return;
      if (MODIFIER_CODES.has(event.code)) {
        if (!event.repeat) lone = event.code;
        return;
      }
      lone = null;
      if (event.ctrlKey || event.metaKey) return;
      if (SPECIAL_CODES.has(event.code) && !typeAllKeys) return;
      const token = keycodeForCode(event.code);
      if (!token) return;
      // Before the editor's own keys (Esc, Delete) and Space-to-pan see it.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) dispatch({ type: 'typeKey', token, advance: typeAdvance });
    };
    const up = (event: KeyboardEvent) => {
      if (lone === null || event.code !== lone) return;
      lone = null;
      if (ignored(event.target)) return;
      const token = keycodeForCode(event.code);
      if (!token) return;
      // A lone Alt would otherwise move focus to the browser's menu.
      event.preventDefault();
      dispatch({ type: 'typeKey', token, advance: typeAdvance });
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('pointerdown', click, true);
    window.addEventListener('mousedown', click, true);
    return () => {
      window.removeEventListener('pointerdown', click, true);
      window.removeEventListener('mousedown', click, true);
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [enabled, dispatch, typeAdvance, typeAllKeys]);
}
