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

/** Where an encoder knob is drawn: its centre, in 1/100 key units. ZMK itself has no such position. */
export interface EncoderSpot {
  x: number;
  y: number;
}

export interface PhysicalLayout {
  name: string;
  keys: PhysicalKey[];
  /** Saved knob positions per sensor (the `sensor-bindings` order); null or missing means the default. */
  encoders?: (EncoderSpot | null)[];
}

/** A knob is drawn about one key unit across. */
export const KNOB_SIZE = 100;

/** Width and height covering every key (ignoring rotation). */
export function layoutBounds(layout: PhysicalLayout): { width: number; height: number } {
  return {
    width: Math.max(...layout.keys.map((k) => k.x + k.w)),
    height: Math.max(...layout.keys.map((k) => k.y + k.h)),
  };
}

/** The axis-aligned outline of a key, rotated around (rx, ry) when it has a rotation. */
export function keyBounds(k: PhysicalKey): { left: number; top: number; right: number; bottom: number } {
  const corners = [
    [k.x, k.y],
    [k.x + k.w, k.y],
    [k.x, k.y + k.h],
    [k.x + k.w, k.y + k.h],
  ].map(([x = 0, y = 0]) => {
    if (!k.r) return [x, y] as const;
    const a = (k.r * Math.PI) / 180;
    const dx = x - k.rx;
    const dy = y - k.ry;
    return [k.rx + dx * Math.cos(a) - dy * Math.sin(a), k.ry + dx * Math.sin(a) + dy * Math.cos(a)] as const;
  });
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/**
 * The area every key covers, rotated keys included, which can start left of
 * or above 0. Drawing from this keeps every key on the canvas (and the page).
 */
export function layoutExtent(layout: PhysicalLayout): { left: number; top: number; width: number; height: number } {
  const knobs = (layout.encoders ?? []).flatMap((s) =>
    s ? [{ left: s.x - KNOB_SIZE / 2, top: s.y - KNOB_SIZE / 2, right: s.x + KNOB_SIZE / 2, bottom: s.y + KNOB_SIZE / 2 }] : [],
  );
  const bounds = [...layout.keys.map(keyBounds), ...knobs];
  const left = Math.min(0, ...bounds.map((b) => b.left));
  const top = Math.min(0, ...bounds.map((b) => b.top));
  const right = Math.max(...bounds.map((b) => b.right));
  const bottom = Math.max(...bounds.map((b) => b.bottom));
  return { left, top, width: right - left, height: bottom - top };
}
