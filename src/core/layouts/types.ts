/**
 * How a keyboard's bindings are laid out as text: each row lists key indices
 * by column, with `null` for an empty column. Used to column-align the
 * generated `.keymap`.
 */
export interface TextLayout {
  name: string;
  rows: (number | null)[][];
}

export function layoutKeyCount(layout: TextLayout): number {
  return layout.rows.reduce((n, row) => n + row.filter((k) => k !== null).length, 0);
}
