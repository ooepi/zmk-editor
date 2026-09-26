// Generates src/core/catalog/keyboards.data.ts from a ZMK checkout.
//
//   git clone --depth 1 --branch v0.3 https://github.com/zmkfirmware/zmk /tmp/zmk
//   node scripts/gen-keyboards.ts /tmp/zmk v0.3
//
// For every keyboard (a shield or board with the "keys" feature) it records the
// metadata from its .zmk.yml, its physical layouts (zmk,physical-layout, all
// variants), the key count of its default keymap, and falls back to a grid
// from the matrix transform when there is no physical layout.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { parse } from 'yaml';
import { importKeymap } from '../src/core/keymap/importer.ts';

const [zmkRoot = '/tmp/zmk', ref = 'v0.3'] = process.argv.slice(2);
const app = join(zmkRoot, 'app');

type Attrs = [number, number, number, number, number, number, number];

interface Meta {
  id: string;
  name: string;
  type: string;
  url?: string;
  requires?: string[];
  exposes?: string[];
  features?: string[];
  siblings?: string[];
  outputs?: string[];
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/** The file's text plus everything it #includes (local first, then app/dts). */
function withIncludes(path: string, seen = new Set<string>()): string {
  if (seen.has(path) || !existsSync(path)) return '';
  seen.add(path);
  const text = readFileSync(path, 'utf8');
  let out = text;
  for (const match of text.matchAll(/#include\s+[<"]([^>"]+)[>"]/g)) {
    const include = match[1] ?? '';
    const candidates = [join(dirname(path), include), join(app, 'dts', include)];
    const found = candidates.find((c) => existsSync(c));
    if (found) out += `\n${withIncludes(found, seen)}`;
  }
  return out;
}

const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');

function parseAttrs(block: string): Attrs[] {
  const keys: Attrs[] = [];
  for (const match of block.matchAll(/&key_physical_attrs((?:\s+(?:\(\s*-?\d+\s*\)|-?\d+)){7})/g)) {
    const nums = [...(match[1] ?? '').matchAll(/-?\d+/g)].map((m) => Number(m[0]));
    const [w = 100, h = 100, x = 0, y = 0, r = 0, rx = 0, ry = 0] = nums;
    keys.push([x, y, w, h, r / 100, rx, ry]);
  }
  return keys;
}

function transformKeys(text: string, label: string | undefined): Attrs[] | null {
  const pattern = label
    ? new RegExp(`${label}\\s*:\\s*[\\w-]+\\s*\\{[^}]*?map\\s*=\\s*<([^>]*)>`)
    : /compatible\s*=\s*"zmk,matrix-transform"[^}]*?map\s*=\s*<([^>]*)>/;
  const map = pattern.exec(text)?.[1];
  if (!map) return null;
  const rc = [...map.matchAll(/RC\(\s*(\d+)\s*,\s*(\d+)\s*\)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
  return rc.map(([row, col]) => [col * 100, row * 100, 100, 100, 0, 0, 0]);
}

const metas = walk(join(app, 'boards'))
  .filter((p) => p.endsWith('.zmk.yml'))
  .map((path) => ({ path, meta: parse(readFileSync(path, 'utf8')) as Meta }));

const keyboards = [];
for (const { path, meta } of metas) {
  if (!meta.features?.includes('keys')) continue;
  const dir = dirname(path);
  const entries = [meta.id, ...(meta.siblings ?? [])].flatMap((id) =>
    ['.overlay', '.dts', '.dtsi'].map((ext) => join(dir, `${id}${ext}`)),
  );
  const text = stripComments(entries.map((e) => withIncludes(e)).join('\n'));

  // bt60_v1 → bt60.keymap, corneish_zen_v1 → corneish_zen.keymap
  const base = meta.id.replace(/_(v|rev)\d+$/, '');
  const keymapPath = [meta.id, base].map((name) => join(dir, `${name}.keymap`)).find((p) => existsSync(p)) ?? join(dir, `${meta.id}.keymap`);
  const keymap = existsSync(keymapPath) ? importKeymap(readFileSync(keymapPath, 'utf8')).model : null;
  const keyCount = keymap?.layers[0]?.bindings.length ?? 0;
  const confPath = [meta.id, base].map((name) => join(dir, `${name}.conf`)).find((p) => existsSync(p)) ?? join(dir, `${meta.id}.conf`);

  const chosen = /zmk,physical-layout\s*=\s*&(\w+)/.exec(text)?.[1];
  const layouts: { name: string; keys: Attrs[] }[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(/(\w+)\s*:\s*[\w-]+\s*\{([^{}]*compatible\s*=\s*"zmk,physical-layout"[^{}]*)\}/g)) {
    const [, label = '', body = ''] = match;
    if (seen.has(label)) continue;
    seen.add(label);
    const keys = parseAttrs(body);
    if (keys.length === 0) continue;
    const name = /display-name\s*=\s*"([^"]*)"/.exec(body)?.[1] ?? label;
    const layout = { name, keys };
    if (label === chosen) layouts.unshift(layout);
    else layouts.push(layout);
  }
  if (layouts.length === 0) {
    const chosenTransform = /zmk,matrix-transform\s*=\s*&(\w+)/.exec(text)?.[1];
    const keys = transformKeys(text, chosenTransform);
    if (keys?.length) layouts.push({ name: 'Grid (from wiring)', keys });
  }

  keyboards.push({
    id: meta.id,
    name: meta.name,
    kind: meta.type === 'board' ? 'board' : 'shield',
    url: meta.url ?? '',
    requires: meta.requires ?? [],
    siblings: meta.siblings ?? [],
    features: meta.features ?? [],
    keyCount,
    keymapPath: keymap ? relative(zmkRoot, keymapPath) : '',
    confPath: existsSync(confPath) ? relative(zmkRoot, confPath) : '',
    layouts,
  });
}
keyboards.sort((a, b) => a.name.localeCompare(b.name));

const controllers = metas
  .filter(({ meta }) => meta.type === 'board' && meta.exposes?.length && !meta.features?.includes('keys'))
  .map(({ meta }) => ({ id: meta.id, name: meta.name, exposes: meta.exposes ?? [], ble: meta.outputs?.includes('ble') ?? false }))
  .sort((a, b) => Number(b.ble) - Number(a.ble) || a.name.localeCompare(b.name));

const out = `// Generated by scripts/gen-keyboards.ts from ZMK ${ref}. Do not edit.
// Layout keys are [x, y, w, h, rotation°, rx, ry] in 1/100 key units.

export interface KeyboardData {
  id: string;
  name: string;
  kind: 'shield' | 'board';
  url: string;
  requires: string[];
  siblings: string[];
  features: string[];
  keyCount: number;
  keymapPath: string;
  confPath: string;
  layouts: { name: string; keys: [number, number, number, number, number, number, number][] }[];
}

export interface ControllerData {
  id: string;
  name: string;
  exposes: string[];
  ble: boolean;
}

export const ZMK_REF = ${JSON.stringify(ref)};

export const KEYBOARD_DATA: KeyboardData[] = ${JSON.stringify(keyboards)};

export const CONTROLLER_DATA: ControllerData[] = ${JSON.stringify(controllers, null, 2)};
`;
writeFileSync(new URL('../src/core/catalog/keyboards.data.ts', import.meta.url), out);
const withLayout = keyboards.filter((k) => k.layouts.length > 0);
const matching = keyboards.filter((k) => k.layouts.some((l) => l.keys.length === k.keyCount));
console.log(`${keyboards.length} keyboards, ${withLayout.length} with a layout, ${matching.length} matching their keymap; ${controllers.length} controllers`);
for (const k of keyboards) {
  if (!k.layouts.some((l) => l.keys.length === k.keyCount)) {
    console.log(`  no matching layout: ${k.id} (keymap ${k.keyCount}; layouts ${k.layouts.map((l) => l.keys.length).join(',') || '-'})`);
  }
}
