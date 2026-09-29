import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Lines that mark state (selection rings, borders, underlines, drop lines) and text must
// stay readable in both themes. The fill accent is too pale for that in the light theme,
// so state lines use --accent-line and text uses --accent-text. See docs/design-system.md.
const DIR = fileURLToPath(new URL('.', import.meta.url));
const TOKENS = readFileSync(`${DIR}tokens.css`, 'utf8');

/** The custom properties declared in the block whose selector starts with `header`. */
function block(header: string): Map<string, string> {
  const start = TOKENS.indexOf(header);
  if (start < 0) throw new Error(`No block ${header}`);
  const body = TOKENS.slice(TOKENS.indexOf('{', start) + 1, TOKENS.indexOf('\n}', start));
  return new Map([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? '', (m[2] ?? '').trim()]));
}

const palette = block(':root {');
const themes = { dark: block(":root,\n:root[data-theme='dark'] {"), light: block(":root[data-theme='light'],") };

function resolve(theme: Map<string, string>, token: string): string {
  let value = theme.get(token) ?? palette.get(token);
  for (let i = 0; value?.startsWith('var(') && i < 5; i++) {
    const name = value.slice(4, -1);
    value = theme.get(name) ?? palette.get(name);
  }
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${token} does not resolve to a hex colour: ${value}`);
  return value;
}

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

const BACKGROUNDS = ['--bg', '--surface', '--surface-2'];

describe.each(Object.entries(themes))('%s theme contrast', (_name, theme) => {
  it.each(['--accent-line', '--focus-ring'])('%s reads as a line (3:1) on every surface', (token) => {
    for (const bg of BACKGROUNDS) expect(contrast(resolve(theme, token), resolve(theme, bg)), `${token} on ${bg}`).toBeGreaterThanOrEqual(3);
  });

  it('--accent-text reads as text (4.5:1) on every surface', () => {
    for (const bg of BACKGROUNDS) expect(contrast(resolve(theme, '--accent-text'), resolve(theme, bg)), `on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
});

describe('state lines', () => {
  const sheets = readdirSync(DIR).filter((f) => f.endsWith('.css') && f !== 'tokens.css');
  // Whole declarations, so multi-line box-shadows are checked too.
  const LINE_WITH_FILL_ACCENT = /\b(?:border(?:-[a-z]+)*|outline(?:-color)?|box-shadow|text-decoration(?:-color)?)\s*:[^;{}]*var\(--accent\)/g;

  it.each(sheets)('%s draws lines with --accent-line, not the fill accent', (file) => {
    const text = readFileSync(`${DIR}${file}`, 'utf8');
    const offending = [...text.matchAll(LINE_WITH_FILL_ACCENT)].map(
      (m) => `${text.slice(0, m.index).split('\n').length}: ${m[0].replace(/\s+/g, ' ')}`,
    );
    expect(offending, 'Use var(--accent-line) for borders, outlines and rings').toEqual([]);
  });
});

describe('focus', () => {
  const sheets = readdirSync(DIR).filter((f) => f.endsWith('.css'));
  // Rules are flat enough here to split on braces: "selector { declarations }".
  const RULE = /([^{}]+)\{([^{}]*)\}/g;

  it.each(sheets)('%s keeps the focus ring on :focus-visible', (file) => {
    const text = readFileSync(`${DIR}${file}`, 'utf8');
    const offending = [...text.matchAll(RULE)]
      .filter(([, selector = '', body = '']) => selector.includes(':focus-visible') && /outline:\s*(?:none|0)\b/.test(body))
      .map(([, selector = '']) => selector.trim().replace(/\s+/g, ' '));
    expect(offending, 'Keyboard users need the ring: style :hover separately').toEqual([]);
  });
});
