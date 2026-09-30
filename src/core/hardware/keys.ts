import type { Binding, Combo, KeymapModel } from '../keymap/model.ts';
import { withSensorBindings } from '../keymap/sensorEdit.ts';
import type { HardwareKey, KeyboardHardware, Side } from './types.ts';
import { directPins, halfSize } from './wiring.ts';

const trans = (): Binding => ({ behavior: 'trans', params: [] });

/**
 * Moves the keymap to a new key list. `newToOld[i]` is the old index of new
 * key `i`, or undefined for an added key (bound to `&trans`). Combos follow
 * their keys; a combo left with fewer than two keys is removed.
 */
export function remapKeyPositions(model: KeymapModel, newToOld: (number | undefined)[]): { model: KeymapModel; notes: string[] } {
  const oldToNew = new Map<number, number>();
  newToOld.forEach((old, index) => {
    if (old !== undefined) oldToNew.set(old, index);
  });
  const layers = model.layers.map((layer) => ({
    ...layer,
    bindings: newToOld.map((old) => (old === undefined ? trans() : (layer.bindings[old] ?? trans()))),
  }));
  const notes: string[] = [];
  const combos: Combo[] = [];
  for (const combo of model.combos) {
    const keyPositions = combo.keyPositions.flatMap((token) => {
      if (!/^\d+$/.test(token)) return [token];
      const moved = oldToNew.get(Number(token));
      return moved === undefined ? [] : [String(moved)];
    });
    if (keyPositions.length < 2) {
      notes.push(`Removed combo ${combo.name}: its keys were deleted.`);
      continue;
    }
    if (keyPositions.length < combo.keyPositions.length) notes.push(`Combo ${combo.name} lost a deleted key.`);
    combos.push({ ...combo, keyPositions });
  }
  return { model: { ...model, layers, combos }, notes };
}

function firstFree(rows: number, cols: number, used: Set<string>): { row: number; col: number } {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) if (!used.has(`${row},${col}`)) return { row, col };
  }
  return { row: 0, col: 0 };
}

/**
 * Adds a key right of the half's last key: on the first free matrix position,
 * or with a new direct input (when a mirrored right half shares the left's
 * inputs, the new input is shared too).
 */
export function addKey(hw: KeyboardHardware, side?: Side): KeyboardHardware {
  const onHalf = hw.keys.filter((k) => !hw.split || k.side === side);
  const last = onHalf.at(-1) ?? hw.keys.at(-1);
  const place = { x: last ? last.x + last.w : 0, y: last ? last.y : 0, w: 100, h: 100, r: 0, rx: 0, ry: 0 };
  const sideField = hw.split && side ? { side } : {};
  const wiring = hw.wiring;
  if (wiring.kind === 'direct') {
    const pins = directPins(wiring, side);
    const key: HardwareKey = { ...place, row: 0, col: pins.length, ...sideField };
    const next = side === 'right' && wiring.right ? { ...wiring, right: [...pins, null] } : { ...wiring, pins: [...wiring.pins, null] };
    return { ...hw, wiring: next, keys: [...hw.keys, key] };
  }
  const size = halfSize(hw, side);
  const spot = firstFree(size.rows, size.cols, new Set(onHalf.map((k) => `${k.row},${k.col}`)));
  return { ...hw, keys: [...hw.keys, { ...place, ...spot, ...sideField }] };
}

export function deleteKey(hw: KeyboardHardware, index: number): KeyboardHardware {
  return deleteKeys(hw, [index]);
}

export function deleteKeys(hw: KeyboardHardware, indices: number[]): KeyboardHardware {
  const gone = new Set(indices);
  return { ...hw, keys: hw.keys.filter((_, i) => !gone.has(i)) };
}

/**
 * Moves every layer's sensor bindings to a new encoder list. `newToOld[i]` is the
 * old index of sensor `i`, or undefined for a new encoder (volume on the base
 * layer, `&trans` elsewhere). No encoders left: the bindings are removed.
 */
export function remapSensors(model: KeymapModel, newToOld: (number | undefined)[]): KeymapModel {
  const layers = model.layers.map((layer, li) => {
    // Layers without encoder bindings fall through in ZMK; leave them so.
    if (li > 0 && !layer.sensorBindings) return layer;
    const old = layer.sensorBindings ?? [];
    const list = newToOld.map((o) => {
      const kept = o === undefined ? undefined : old[o];
      if (kept) return kept;
      return li === 0 ? { behavior: 'inc_dec_kp', params: ['C_VOL_UP', 'C_VOL_DN'] } : trans();
    });
    return withSensorBindings(layer, list);
  });
  return { ...model, layers };
}

/** A key's centre with its rotation applied (SVG: clockwise, y down). */
function keyCentre(key: HardwareKey): { x: number; y: number } {
  const cx = key.x + key.w / 2;
  const cy = key.y + key.h / 2;
  if (!key.r) return { x: cx, y: cy };
  const a = (key.r * Math.PI) / 180;
  const dx = cx - key.rx;
  const dy = cy - key.ry;
  return { x: key.rx + dx * Math.cos(a) - dy * Math.sin(a), y: key.ry + dx * Math.sin(a) + dy * Math.cos(a) };
}

/** Half a key (in key units × 100): how far a key's centre can be from its column's, or below its row's first key. */
const HALF = 50;

/** A key's centre, and where it is in the keyboard's key list. */
interface Placed {
  index: number;
  at: { x: number; y: number };
}

/**
 * Columns first, as DIY splits are built: keys are grouped into columns by x,
 * and a key's row is its place in its column, so column stagger of any size is
 * fine and a thumb key below a column lands on the next row. Columns with only
 * a stray key or two (e.g. a thumb between columns) join the nearest column.
 * Numbers are placed from the inner side (right on the left half, left on the
 * right half), so a mirrored right half's columns pair with the left's.
 * Undefined when the board is row-staggered (keys in a "column" sit side by side).
 */
function byColumns(items: Placed[], cols: number, side: Side | undefined): Map<number, { row: number; col: number }> | undefined {
  const sorted = [...items].sort((a, b) => a.at.x - b.at.x);
  const clusters: Placed[][] = [];
  for (const item of sorted) {
    const last = clusters.at(-1);
    const mean = last ? last.reduce((sum, k) => sum + k.at.x, 0) / last.length : undefined;
    if (last && mean !== undefined && item.at.x - mean <= HALF) last.push(item);
    else clusters.push([item]);
  }
  // Stray keys join the nearest proper column.
  const most = Math.max(0, ...clusters.map((c) => c.length));
  const centre = (c: Placed[]) => c.reduce((sum, k) => sum + k.at.x, 0) / c.length;
  const proper = clusters.filter((c) => c.length * 2 >= most);
  for (const stray of clusters.filter((c) => c.length * 2 < most)) {
    const nearest = proper.reduce((best, c) => (Math.abs(centre(c) - centre(stray)) < Math.abs(centre(best) - centre(stray)) ? c : best));
    nearest.push(...stray);
  }
  // Row stagger shows as keys off their column's line; then rows come first.
  const median = (c: Placed[]) => [...c].map((k) => k.at.x).sort((a, b) => a - b)[Math.floor(c.length / 2)] ?? 0;
  const off = proper.flatMap((c) => c.filter((k) => Math.abs(k.at.x - median(c)) > HALF / 5)).length;
  if (off * 4 > items.length) return undefined;
  const shift = side === 'left' ? Math.max(0, cols - proper.length) : 0;
  const result = new Map<number, { row: number; col: number }>();
  proper.forEach((column, c) => {
    [...column].sort((a, b) => a.at.y - b.at.y).forEach((k, row) => result.set(k.index, { row, col: c + shift }));
  });
  return result;
}

/**
 * Rows first, for row-staggered boards: a row starts with its highest key and
 * takes every key less than half a key below it; columns go along the row
 * from the outer side (right to left on a mirrored right half, numbered from
 * the last column), so both halves' outer columns share a pin.
 */
function byRows(items: Placed[], cols: number, mirrored: boolean): Map<number, { row: number; col: number }> {
  const sorted = [...items].sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x);
  const rows: Placed[][] = [];
  for (const item of sorted) {
    const row = rows.at(-1);
    const top = row?.[0];
    if (row && top && item.at.y - top.at.y <= HALF) row.push(item);
    else rows.push([item]);
  }
  const result = new Map<number, { row: number; col: number }>();
  rows.forEach((row, r) => {
    [...row]
      .sort((a, b) => (mirrored ? b.at.x - a.at.x : a.at.x - b.at.x))
      .forEach((k, c) => result.set(k.index, { row: r, col: mirrored ? Math.max(0, cols - 1 - c) : c }));
  });
  return result;
}

/**
 * Gives every key a row and column (or direct input) from where it sits, per
 * half; see `byColumns` and `byRows`. Direct inputs follow reading order,
 * right to left on a mirrored right half as the wizard numbers them. Keys
 * without a half on a split count as the left half's.
 */
export function numberFromPositions(hw: KeyboardHardware): KeyboardHardware {
  const keys = [...hw.keys];
  const sides: (Side | undefined)[] = hw.split ? ['left', 'right'] : [undefined];
  for (const side of sides) {
    const items: Placed[] = hw.keys
      .map((key, index) => ({ index, at: keyCentre(key), key }))
      .filter(({ key }) => !hw.split || (key.side ?? 'left') === side)
      .map(({ index, at }) => ({ index, at }));
    if (items.length === 0) continue;
    const mirrored = side === 'right' && !hw.wiring.right;
    const { cols } = halfSize(hw, side);
    const spots = byColumns(items, cols, hw.split ? side : undefined) ?? byRows(items, cols, mirrored);
    if (hw.wiring.kind === 'direct') {
      const order = [...items].sort((a, b) => {
        const ra = spots.get(a.index)?.row ?? 0;
        const rb = spots.get(b.index)?.row ?? 0;
        return ra - rb || (mirrored ? b.at.x - a.at.x : a.at.x - b.at.x);
      });
      order.forEach((k, input) => {
        const key = keys[k.index];
        if (key) keys[k.index] = { ...key, row: 0, col: input };
      });
    } else {
      for (const k of items) {
        const key = keys[k.index];
        const spot = spots.get(k.index);
        if (key && spot) keys[k.index] = { ...key, ...spot };
      }
    }
  }
  return { ...hw, keys };
}
