import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The design-system rule: raw colours live only in tokens.css, and components use
// semantic tokens (--surface, --accent…), never the palette (--lime-300…).
// See docs/design-system.md.
const DIR = fileURLToPath(new URL('.', import.meta.url));
const RAW_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i;
const PALETTE_TOKEN = /var\(--(?:graphite|paper|lime|blue|amber|violet|pink|cyan|red|green)-\d+\)/;

const sheets = readdirSync(DIR).filter((f) => f.endsWith('.css') && f !== 'tokens.css');
const offending = (file: string, pattern: RegExp) =>
  readFileSync(`${DIR}${file}`, 'utf8')
    .split('\n')
    .map((line, i) => `${i + 1}: ${line.trim()}`)
    .filter((line) => pattern.test(line));

describe('design tokens', () => {
  it('finds the stylesheets', () => {
    expect(sheets).toContain('controls.css');
  });

  it.each(sheets)('%s uses tokens, not raw colours', (file) => {
    expect(offending(file, RAW_COLOUR), 'Move the colour into tokens.css as a semantic token').toEqual([]);
  });

  it.each(sheets)('%s uses semantic tokens, not the palette', (file) => {
    expect(offending(file, PALETTE_TOKEN), 'Use a semantic token such as --accent or --surface').toEqual([]);
  });
});
