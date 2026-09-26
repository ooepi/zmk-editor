import type { PhysicalKey, PhysicalLayout } from './types.ts';

const key = (x: number, y: number): PhysicalKey => ({ x, y, w: 100, h: 100, r: 0, rx: 0, ry: 0 });

/** `count` keys in rows of `columns`, in binding order. */
export function gridTemplate(count: number, columns: number): PhysicalLayout {
  const cols = Math.max(1, Math.round(columns));
  return { name: 'custom', keys: Array.from({ length: count }, (_, i) => key((i % cols) * 100, Math.floor(i / cols) * 100)) };
}

/** Gap between the halves, in key units. */
const HALF_GAP = 2;

/**
 * A split keyboard with `count` keys in binding order: rows across both
 * halves (left then right), leftovers on an extra row, then `thumbs` keys
 * per half near the middle.
 */
export function splitTemplate(count: number, options: { columns: number; thumbs: number }): PhysicalLayout {
  const columns = Math.max(1, Math.round(options.columns));
  const thumbs = Math.max(0, Math.round(options.thumbs));
  const body = count - 2 * thumbs;
  if (body < 0) return gridTemplate(count, columns * 2);
  const rightStart = (columns + HALF_GAP) * 100;
  const rows = Math.floor(body / (2 * columns));
  const keys: PhysicalKey[] = [];
  for (let row = 0; row < rows; row++) {
    for (let c = 0; c < columns; c++) keys.push(key(c * 100, row * 100));
    for (let c = 0; c < columns; c++) keys.push(key(rightStart + c * 100, row * 100));
  }
  let y = rows * 100;
  const leftover = body - rows * 2 * columns;
  if (leftover > 0) {
    const left = Math.ceil(leftover / 2);
    for (let c = 0; c < left; c++) keys.push(key(c * 100, y));
    for (let c = 0; c < leftover - left; c++) keys.push(key(rightStart + c * 100, y));
    y += 100;
  }
  for (let t = 0; t < thumbs; t++) keys.push(key((columns - thumbs + t) * 100, y));
  for (let t = 0; t < thumbs; t++) keys.push(key(rightStart + t * 100, y));
  return { name: 'custom', keys };
}
