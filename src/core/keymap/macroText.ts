import { KEYCODES, preferredName } from '../catalog/keycodes.ts';
import type { Binding } from './model.ts';

const CHARACTERS = new Map<string, string>([
  [' ', 'SPACE'],
  ['\n', 'ENTER'],
  ['\t', 'TAB'],
]);
for (const keycode of KEYCODES) {
  if (keycode.category === 'symbols' && [...keycode.label].length === 1 && !/\d$/.test(keycode.name)) {
    if (!CHARACTERS.has(keycode.label)) CHARACTERS.set(keycode.label, preferredName(keycode));
  }
}

function keyFor(char: string): string | undefined {
  if (/^[a-z]$/.test(char)) return char.toUpperCase();
  if (/^[A-Z]$/.test(char)) return `LS(${char})`;
  if (/^\d$/.test(char)) return `N${char}`;
  return CHARACTERS.get(char);
}

/**
 * Macro steps that type `text` on a US layout. Characters without a key
 * (like ä, which needs the Unicode module) are skipped and reported.
 */
export function textToBindings(text: string): { bindings: Binding[]; unsupported: string[] } {
  const bindings: Binding[] = [];
  const unsupported: string[] = [];
  for (const char of text.replace(/\r\n?/g, '\n')) {
    const key = keyFor(char);
    if (key) bindings.push({ behavior: 'kp', params: [key] });
    else if (!unsupported.includes(char)) unsupported.push(char);
  }
  return { bindings, unsupported };
}
