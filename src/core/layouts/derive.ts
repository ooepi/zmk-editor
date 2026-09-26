import type { PhysicalLayout, TextLayout } from './types.ts';

/** A key further left than this (in 1/100 units) than the previous one starts a new row. */
const ROW_BREAK = 150;
const COLUMN_TOLERANCE = 60;

/**
 * A text grid for the `.keymap` from key positions. Keymaps list keys row by
 * row, so a new row starts where the next key jumps back to the left; columns
 * come from the keys' horizontal positions (a key that lands on a taken
 * column moves right, adding columns if needed).
 */
export function textLayoutFromPhysical(layout: PhysicalLayout): TextLayout | undefined {
  const centers = layout.keys.map((k, index) => ({ index, x: k.x + k.w / 2 }));
  if (centers.length === 0) return undefined;

  const rows: (typeof centers)[] = [];
  for (const key of centers) {
    const row = rows.at(-1);
    const previous = row?.at(-1);
    if (row && previous && key.x > previous.x - ROW_BREAK) row.push(key);
    else rows.push([key]);
  }

  const columnXs: number[] = [];
  for (const x of centers.map((c) => c.x).sort((a, b) => a - b)) {
    if (columnXs.length === 0 || x - (columnXs.at(-1) ?? 0) > COLUMN_TOLERANCE) columnXs.push(x);
  }
  const columnOf = (x: number) =>
    columnXs.reduce((best, cx, i) => (Math.abs(cx - x) < Math.abs((columnXs[best] ?? 0) - x) ? i : best), 0);

  const grid: (number | null)[][] = [];
  for (const row of rows) {
    const cells: (number | null)[] = Array.from({ length: columnXs.length }, () => null);
    let last = -1;
    for (const key of row) {
      let column = columnOf(key.x);
      // Rotated or offset keys can land on a taken column; nudge right while staying in order.
      while (column <= last || cells[column] != null) column++;
      while (cells.length <= column) cells.push(null);
      cells[column] = key.index;
      last = column;
    }
    grid.push(cells);
  }
  const width = Math.max(...grid.map((row) => row.length));
  const padded = grid.map((row) => [...row, ...Array.from({ length: width - row.length }, (): null => null)]);
  const used = Array.from({ length: width }, (_, c) => padded.some((row) => row[c] != null));
  return { name: layout.name, rows: padded.map((row) => row.filter((_, c) => used[c])) };
}
