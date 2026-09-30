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

/** How far apart (in key units × 100) two keys' centres can be vertically and still be on one row. */
const ROW_GAP = 50;

/**
 * Gives every key a row and column (or direct input) from where it sits, per
 * half. Rows go top to bottom: keys sorted by height start a new row where
 * the next one is more than half a key lower, so column stagger stays on its
 * row and thumb keys get their own. Columns go left to right within a row,
 * which is also how the wizard numbers a mirrored right half. Direct inputs
 * follow reading order, right to left on a mirrored right half as the wizard
 * numbers them.
 */
export function numberFromPositions(hw: KeyboardHardware): KeyboardHardware {
  const keys = [...hw.keys];
  const sides: (Side | undefined)[] = hw.split ? ['left', 'right'] : [undefined];
  for (const side of sides) {
    const onHalf = hw.keys
      .map((key, index) => ({ key, index, at: keyCentre(key) }))
      .filter(({ key }) => !hw.split || key.side === side)
      .sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x);
    const rows: (typeof onHalf)[] = [];
    let last: number | undefined;
    for (const k of onHalf) {
      if (last === undefined || k.at.y - last > ROW_GAP) rows.push([]);
      rows[rows.length - 1]?.push(k);
      last = k.at.y;
    }
    const mirrored = side === 'right' && hw.wiring.kind === 'direct' && !hw.wiring.right;
    let input = 0;
    rows.forEach((row, r) => {
      row.sort((a, b) => (mirrored ? b.at.x - a.at.x : a.at.x - b.at.x) || a.index - b.index);
      row.forEach((k, c) => {
        keys[k.index] = hw.wiring.kind === 'direct' ? { ...k.key, row: 0, col: input++ } : { ...k.key, row: r, col: c };
      });
    });
  }
  return { ...hw, keys };
}
