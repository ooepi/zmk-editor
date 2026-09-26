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

/**
 * A key's position like ZMK's `key_physical_attrs`: position and size in
 * 1/100 key units, rotation `r` in degrees (clockwise) around (`rx`, `ry`).
 */
export interface PhysicalKey {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  rx: number;
  ry: number;
}

export interface PhysicalLayout {
  name: string;
  keys: PhysicalKey[];
}

/** Width and height covering every key (ignoring rotation). */
export function layoutBounds(layout: PhysicalLayout): { width: number; height: number } {
  return {
    width: Math.max(...layout.keys.map((k) => k.x + k.w)),
    height: Math.max(...layout.keys.map((k) => k.y + k.h)),
  };
}
