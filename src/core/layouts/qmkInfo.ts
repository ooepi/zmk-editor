import type { PhysicalKey, PhysicalLayout } from './types.ts';

/**
 * `config/info.json` in QMK's format (key units), as used by
 * nickcoutsos/keymap-editor: { layouts: { LAYOUT: { layout: [{ x, y, w, h, r, rx, ry }] } } }.
 */
export function parseInfoJson(text: string): PhysicalLayout | null {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }
  const layouts = (doc as { layouts?: Record<string, { layout?: unknown }> } | null)?.layouts;
  const first = layouts ? Object.values(layouts).find((l) => Array.isArray(l?.layout)) : undefined;
  if (!first || !Array.isArray(first.layout) || first.layout.length === 0) return null;
  const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
  const keys = first.layout.map((raw: unknown): PhysicalKey => {
    const k = (raw ?? {}) as Record<string, unknown>;
    const u = (value: unknown, fallback: number) => Math.round(num(value, fallback) * 100);
    return { x: u(k.x, 0), y: u(k.y, 0), w: u(k.w, 1), h: u(k.h, 1), r: num(k.r, 0), rx: u(k.rx, 0), ry: u(k.ry, 0) };
  });
  return { name: 'custom', keys };
}

const unit = (value: number) => Math.round(value) / 100;

export function generateInfoJson(layout: PhysicalLayout): string {
  const keys = layout.keys.map((k) => {
    const key: Record<string, number> = { x: unit(k.x), y: unit(k.y) };
    if (k.w !== 100) key.w = unit(k.w);
    if (k.h !== 100) key.h = unit(k.h);
    if (k.r) {
      key.r = k.r;
      key.rx = unit(k.rx);
      key.ry = unit(k.ry);
    }
    return key;
  });
  const lines = keys.map((k) => `        ${JSON.stringify(k)}`);
  return `{\n  "layouts": {\n    "LAYOUT": {\n      "layout": [\n${lines.join(',\n')}\n      ]\n    }\n  }\n}\n`;
}
