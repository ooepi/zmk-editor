import { UNICODE_ALIASES } from './unicode.data.ts';

export interface UnicodeMode {
  /** Value for `default-mode`, e.g. UC_MODE_WIN_COMPOSE. */
  id: string;
  /** Param for a key that switches to this mode, e.g. UC_SET_WIN_COMPOSE. */
  set: string;
  label: string;
  os: string;
  /** What the computer needs, in one sentence. */
  setup: string;
}

/** zmk-unicode's input systems. WinCompose is its default. */
export const UNICODE_MODES: UnicodeMode[] = [
  {
    id: 'UC_MODE_WIN_COMPOSE',
    set: 'UC_SET_WIN_COMPOSE',
    label: 'WinCompose',
    os: 'Windows',
    setup: 'Install WinCompose (github.com/samhocevar/wincompose); it starts with Windows. Uses Right Alt as the compose key.',
  },
  {
    id: 'UC_MODE_WIN_ALT',
    set: 'UC_SET_WIN_ALT',
    label: 'Win HexNumpad',
    os: 'Windows',
    setup: 'Built into Windows but unreliable; needs the EnableHexNumpad registry setting and only reaches U+FFFF.',
  },
  {
    id: 'UC_MODE_MACOS',
    set: 'UC_SET_MACOS',
    label: 'macOS',
    os: 'macOS',
    setup: 'Add "Unicode Hex Input" under System Settings → Keyboard → Input Sources and select it.',
  },
  {
    id: 'UC_MODE_LINUX',
    set: 'UC_SET_LINUX',
    label: 'Linux',
    os: 'Linux',
    setup: 'Works with IBus (default on GNOME) via Ctrl+Shift+U.',
  },
  {
    id: 'UC_MODE_LINUX_ALT',
    set: 'UC_SET_LINUX_ALT',
    label: 'Linux (alt)',
    os: 'Linux',
    setup: 'Like Linux, but holds Ctrl+Shift for the whole input; try it if Linux mode misbehaves.',
  },
  { id: 'UC_MODE_EMACS', set: 'UC_SET_EMACS', label: 'Emacs', os: 'Emacs', setup: 'Uses C-x 8 RET inside Emacs.' },
];

export const DEFAULT_UNICODE_MODE = 'UC_MODE_WIN_COMPOSE';

export interface UnicodeAlias {
  name: string;
  language: string;
  char: string;
  shifted: string;
}

export const UNICODE_LANGUAGES = [...new Set(UNICODE_ALIASES.map((a) => a.language))];

const ALIASES: UnicodeAlias[] = UNICODE_ALIASES.map((a) => ({
  name: a.name,
  language: a.language,
  char: String.fromCodePoint(a.lower),
  shifted: String.fromCodePoint(a.upper),
}));

const BY_NAME = new Map(ALIASES.map((a) => [a.name, a]));

export function findUnicodeAlias(name: string): UnicodeAlias | undefined {
  return BY_NAME.get(name);
}

/**
 * Aliases matching a character, name or language. `preferred` languages
 * rank first among equal matches (e.g. swedish for Finnish users).
 */
export function searchUnicode(query: string, language?: string, preferred: string[] = []): UnicodeAlias[] {
  const q = query.trim();
  const upper = q.toUpperCase();
  const pool = language ? ALIASES.filter((a) => a.language === language) : ALIASES;
  const scored = pool.flatMap((alias, index) => {
    let score = 0;
    if (!q) score = 1;
    else if (alias.char === q || alias.shifted === q) score = 4;
    else if (alias.name === upper || alias.name === `UC_${upper}`) score = 3;
    else if (alias.name.includes(upper) || alias.language.startsWith(q.toLowerCase())) score = 2;
    return score > 0 ? [{ alias, index, score, preferred: preferred.includes(alias.language) ? 0 : 1 }] : [];
  });
  return scored
    .sort((a, b) => b.score - a.score || a.preferred - b.preferred || a.index - b.index)
    .map((s) => s.alias);
}

export type UnicodeParams = { kind: 'char'; char: string; shifted: string } | { kind: 'mode'; mode: string };

function codePoint(token: string): number | undefined {
  const n = /^0x[0-9a-f]+$/i.test(token) ? parseInt(token, 16) : /^\d+$/.test(token) ? Number(token) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? n : undefined;
}

/** What `&uc` params mean: an alias, two code points, or a mode switch. */
export function parseUnicodeParams(params: string[]): UnicodeParams | null {
  const [first, second, ...rest] = params;
  if (first === undefined || rest.length > 0) return null;
  if (second === undefined) {
    const mode = UNICODE_MODES.find((m) => m.set === first);
    if (mode) return { kind: 'mode', mode: mode.id };
    const alias = findUnicodeAlias(first);
    return alias ? { kind: 'char', char: alias.char, shifted: alias.shifted } : null;
  }
  if (first === 'UC_SELECT_INPUT_MODE' && UNICODE_MODES.some((m) => m.id === second)) return { kind: 'mode', mode: second };
  const lower = codePoint(first);
  const upper = codePoint(second);
  if (lower === undefined || upper === undefined || lower === 0) return null;
  const char = String.fromCodePoint(lower);
  return { kind: 'char', char, shifted: upper === 0 ? char : String.fromCodePoint(upper) };
}

/** Keycap labels for `&uc` params. */
export function unicodeLabel(params: string[]): { main: string; sub?: string } {
  const parsed = parseUnicodeParams(params);
  if (!parsed) return { main: params.join(' '), sub: 'uc' };
  if (parsed.kind === 'mode') return { main: UNICODE_MODES.find((m) => m.id === parsed.mode)?.label ?? parsed.mode, sub: 'uc mode' };
  return parsed.shifted === parsed.char ? { main: parsed.char } : { main: parsed.char, sub: parsed.shifted };
}

/** `&uc` params for any character: its code point, and its uppercase form when it has one. */
export function paramsForCharacter(char: string): string[] {
  const lower = char.codePointAt(0) ?? 0;
  const upperChar = char.toUpperCase();
  const upper = [...upperChar].length === 1 ? (upperChar.codePointAt(0) ?? 0) : lower;
  const hex = (n: number) => `0x${n.toString(16).toUpperCase()}`;
  return [hex(lower), upper === lower ? '0' : hex(upper)];
}
