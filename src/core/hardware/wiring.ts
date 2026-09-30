import { displayPins, halfDisplay } from './displays.ts';
import { interconnectOf } from './interconnects.ts';
import type { DirectWiring, Encoder, HardwareKey, KeyboardHardware, MatrixPins, MatrixWiring, Pin, Side } from './types.ts';

export type PinList = 'rows' | 'cols' | 'pins' | 'encoderA' | 'encoderB';

/** The halves to generate: both on a split, one unnamed half otherwise. */
export function halves(hw: KeyboardHardware): (Side | undefined)[] {
  return hw.split ? ['left', 'right'] : [undefined];
}

/**
 * One half's matrix pins. Without `right`, the right half is a mirror image of
 * the left, like a reversible PCB: the same row pins and the column pins in
 * reverse order, so the outer column uses the same pin on both halves.
 */
export function matrixPins(wiring: MatrixWiring, side?: Side): MatrixPins {
  if (side !== 'right') return { rows: wiring.rows, cols: wiring.cols };
  return wiring.right ?? { rows: wiring.rows, cols: [...wiring.cols].reverse() };
}

/** One half's direct input pins; without `right` both halves use the same list. */
export function directPins(wiring: DirectWiring, side?: Side): Pin[] {
  return side === 'right' ? (wiring.right ?? wiring.pins) : wiring.pins;
}

/** A half's matrix size; direct wiring is one row with a column per input. */
export function halfSize(hw: KeyboardHardware, side?: Side): { rows: number; cols: number } {
  if (hw.wiring.kind === 'direct') return { rows: 1, cols: directPins(hw.wiring, side).length };
  const pins = matrixPins(hw.wiring, side);
  return { rows: pins.rows.length, cols: pins.cols.length };
}

function withoutRight<T extends { right?: unknown }>(wiring: T): T {
  const copy = { ...wiring };
  delete copy.right;
  return copy;
}

/**
 * One half's encoders. A mirrored right half (no pins of its own) mirrors the
 * left's encoders: the same pins with A and B swapped, because a mirrored
 * encoder turns the other way. A right half with its own pins has its own
 * encoders: `rightEncoders`, or none (keyboards made before encoders existed).
 */
export function halfEncoders(hw: KeyboardHardware, side?: Side): Encoder[] {
  const left = hw.encoders ?? [];
  if (side !== 'right') return left;
  if (hw.rightEncoders) return hw.rightEncoders;
  return hw.wiring.right ? [] : left.map((e) => ({ a: e.b, b: e.a }));
}

/** Sets an encoder pin. Setting one on a mirrored right half gives the right half its own pins first. */
export function setEncoderPin(hw: KeyboardHardware, side: Side | undefined, index: number, which: 'a' | 'b', pin: Pin): KeyboardHardware {
  const next = side === 'right' && !hw.rightEncoders ? setRightWiredDifferently(hw, true) : hw;
  const put = (list: Encoder[]) => list.map((e, i) => (i === index ? { ...e, [which]: pin } : e));
  return side === 'right' ? { ...next, rightEncoders: put(next.rightEncoders ?? []) } : { ...next, encoders: put(next.encoders ?? []) };
}

/** Sets one pin. Setting a pin on a mirrored right half gives it its own pins first. */
export function setPin(hw: KeyboardHardware, side: Side | undefined, list: PinList, index: number, pin: Pin): KeyboardHardware {
  if (list === 'encoderA' || list === 'encoderB') return setEncoderPin(hw, side, index, list === 'encoderA' ? 'a' : 'b', pin);
  const put = (pins: Pin[]) => pins.map((p, i) => (i === index ? pin : p));
  const wiring = hw.wiring;
  if (wiring.kind === 'direct') {
    if (side === 'right') return { ...hw, wiring: { ...wiring, right: put(directPins(wiring, 'right')) } };
    return { ...hw, wiring: { ...wiring, pins: put(wiring.pins) } };
  }
  const which = list === 'rows' ? 'rows' : 'cols';
  if (side === 'right') {
    const right = matrixPins(wiring, 'right');
    return { ...hw, wiring: { ...wiring, right: { ...right, [which]: put(right[which]) } } };
  }
  return { ...hw, wiring: { ...wiring, [which]: put(wiring[which]) } };
}

/** Gives the right half its own pins and encoders (starting from the mirrored ones), or makes it a mirror again. */
export function setRightWiredDifferently(hw: KeyboardHardware, on: boolean): KeyboardHardware {
  const wiring = hw.wiring;
  const nextWiring =
    wiring.kind === 'direct'
      ? on ? { ...wiring, right: [...directPins(wiring, 'right')] } : withoutRight(wiring)
      : on ? { ...wiring, right: matrixPins(wiring, 'right') } : withoutRight(wiring);
  const next: KeyboardHardware = { ...hw, wiring: nextWiring };
  const own = on ? halfEncoders(hw, 'right').map((e) => ({ ...e })) : [];
  // An empty list is the same as none once the right half has its own pins; leave it out.
  if (own.length > 0) next.rightEncoders = own;
  else delete next.rightEncoders;
  return next;
}

/** Resizes the matrix of both halves; new rows and columns have no pin yet. */
export function resizeMatrix(hw: KeyboardHardware, rows: number, cols: number): KeyboardHardware {
  const wiring = hw.wiring;
  if (wiring.kind !== 'matrix') return hw;
  const fit = (pins: Pin[], n: number): Pin[] => Array.from({ length: n }, (_, i) => pins[i] ?? null);
  const next: MatrixWiring = { ...wiring, rows: fit(wiring.rows, rows), cols: fit(wiring.cols, cols) };
  if (wiring.right) next.right = { rows: fit(wiring.right.rows, rows), cols: fit(wiring.right.cols, cols) };
  // A mirrored right half lists its columns in reverse, so its keys shift to keep their pins.
  const shift = hw.split && !wiring.right ? cols - wiring.cols.length : 0;
  const keys = shift ? hw.keys.map((k) => (k.side === 'right' ? { ...k, col: k.col + shift } : k)) : hw.keys;
  return { ...hw, wiring: next, keys };
}

/** Keys that read a half's direct input list (both halves share it when the right mirrors the left). */
function readsInputs(hw: KeyboardHardware, side: Side | undefined, key: HardwareKey): boolean {
  const shared = hw.wiring.kind === 'direct' && !hw.wiring.right;
  return !hw.split || shared || key.side === side;
}

export function directInputUsed(hw: KeyboardHardware, side: Side | undefined, index: number): boolean {
  return hw.keys.some((k) => k.col === index && readsInputs(hw, side, k));
}

/** Removes a direct input; keys on later inputs move down one. */
export function removeDirectPin(hw: KeyboardHardware, side: Side | undefined, index: number): KeyboardHardware {
  const wiring = hw.wiring;
  if (wiring.kind !== 'direct') return hw;
  const drop = (pins: Pin[]) => pins.filter((_, i) => i !== index);
  const next: DirectWiring = side === 'right' && wiring.right ? { ...wiring, right: drop(wiring.right) } : { ...wiring, pins: drop(wiring.pins) };
  const keys = hw.keys.map((k) => (readsInputs(hw, side, k) && k.col > index ? { ...k, col: k.col - 1 } : k));
  return { ...hw, wiring: next, keys };
}

/** What each pin is used for on a half, e.g. 4 → ["Row 0"]. */
export function pinUses(hw: KeyboardHardware, side?: Side): Map<number, string[]> {
  const uses = new Map<number, string[]>();
  const add = (pin: Pin, what: string) => {
    if (pin !== null) uses.set(pin, [...(uses.get(pin) ?? []), what]);
  };
  if (hw.wiring.kind === 'direct') {
    directPins(hw.wiring, side).forEach((pin, i) => add(pin, `Input ${i}`));
  } else {
    const pins = matrixPins(hw.wiring, side);
    pins.rows.forEach((pin, i) => add(pin, `Row ${i}`));
    pins.cols.forEach((pin, i) => add(pin, `Column ${i}`));
  }
  halfEncoders(hw, side).forEach((e, i) => {
    add(e.a, `Encoder ${i} A`);
    add(e.b, `Encoder ${i} B`);
  });
  const display = halfDisplay(hw, side);
  if (display) for (const { pin, use } of displayPins(display, interconnectOf(hw.controller))) add(pin, use);
  return uses;
}
