import { isRecord } from '../files/yaml-util.ts';
import { DISPLAY_KINDS, DISPLAY_SIGNALS } from './displays.ts';
import { isShiftOutput } from './shiftRegisters.ts';
import type {
  DirectWiring,
  DisplayKind,
  DisplayPinOverrides,
  DisplaySignal,
  Encoder,
  HardwareKey,
  KeyboardHardware,
  LinePin,
  MatrixWiring,
  Pin,
  ShiftRegisters,
  Wiring,
} from './types.ts';

/** Version 2 adds `displayPins`, version 3 shift registers; each file is written with the lowest version that fits. */
const VERSION = 3;

const hasShiftRegisters = (hw: KeyboardHardware) =>
  hw.shiftRegisters !== undefined || (hw.wiring.kind === 'matrix' && [...hw.wiring.rows, ...hw.wiring.cols].some(isShiftOutput));

export const shieldDir = (name: string) => `config/boards/shields/${name}`;
export const definitionPath = (name: string) => `${shieldDir(name)}/${name}.editor.json`;

/** The definition as JSON with a fixed field order and one key per line. */
export function serializeHardware(hw: KeyboardHardware): string {
  const w = hw.wiring;
  const wiring =
    w.kind === 'matrix'
      ? { kind: w.kind, diodeDirection: w.diodeDirection, rows: w.rows, cols: w.cols, ...(w.right ? { right: { rows: w.right.rows, cols: w.right.cols } } : {}) }
      : { kind: w.kind, pins: w.pins, ...(w.right ? { right: w.right } : {}) };
  const head = JSON.stringify(
    {
      version: hasShiftRegisters(hw) ? 3 : hw.displayPins ? 2 : 1,
      name: hw.name,
      displayName: hw.displayName,
      controller: hw.controller,
      split: hw.split,
      wiring,
      ...(hw.encoders && hw.encoders.length > 0 ? { encoders: hw.encoders.map(({ a, b }) => ({ a, b })) } : {}),
      // Only when there are encoders at all: keyboards without them keep their files unchanged.
      ...(hw.rightEncoders && (hw.rightEncoders.length > 0 || (hw.encoders?.length ?? 0) > 0)
        ? { rightEncoders: hw.rightEncoders.map(({ a, b }) => ({ a, b })) }
        : {}),
      ...(hw.displays ? { displays: { ...(hw.displays.left ? { left: hw.displays.left } : {}), ...(hw.displays.right ? { right: hw.displays.right } : {}) } } : {}),
      ...(hw.displayPins ? { displayPins: serializeDisplayPins(hw.displayPins) } : {}),
      ...(hw.shiftRegisters
        ? {
            shiftRegisters: {
              count: hw.shiftRegisters.count,
              latch: hw.shiftRegisters.latch,
              ...(hw.shiftRegisters.data !== undefined ? { data: hw.shiftRegisters.data } : {}),
              ...(hw.shiftRegisters.clock !== undefined ? { clock: hw.shiftRegisters.clock } : {}),
              ...(hw.shiftRegisters.ownBus ? { ownBus: true } : {}),
            },
          }
        : {}),
      ...(hw.encoderSpots?.some(Boolean) ? { encoderSpots: hw.encoderSpots.map((s) => (s ? { x: s.x, y: s.y } : null)) } : {}),
      keys: [],
    },
    null,
    2,
  );
  const keys = hw.keys.map(({ x, y, w: width, h, r, rx, ry, row, col, side }) =>
    JSON.stringify({ x, y, w: width, h, r, rx, ry, row, col, ...(side ? { side } : {}) }),
  );
  const list = keys.length > 0 ? `[\n${keys.map((k) => `    ${k}`).join(',\n')}\n  ]` : '[]';
  const compact = head.replace(/\{\n\s+"sr": (\d+)\n\s+\}/g, '{ "sr": $1 }');
  return `${compact.replace('"keys": []', `"keys": ${list}`)}\n`;
}

/** Overrides with their signals in a fixed order. */
function serializeDisplayPins(pins: NonNullable<KeyboardHardware['displayPins']>) {
  const half = (o: DisplayPinOverrides) => Object.fromEntries(DISPLAY_SIGNALS.filter((s) => s in o).map((s) => [s, o[s]]));
  return { ...(pins.left ? { left: half(pins.left) } : {}), ...(pins.right ? { right: half(pins.right) } : {}) };
}

export function parseHardware(text: string): KeyboardHardware {
  const data: unknown = JSON.parse(text);
  if (!isRecord(data)) throw new Error('it isn’t a JSON object');
  if (data.version !== 1 && data.version !== 2 && data.version !== VERSION) throw new Error(`version ${String(data.version)} isn’t supported; update the editor`);
  const str = (value: unknown, what: string): string => {
    if (typeof value !== 'string') throw new Error(`${what} is missing`);
    return value;
  };
  const num = (value: unknown, what: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${what} must be a number`);
    return value;
  };
  const pins = (value: unknown, what: string): Pin[] => {
    if (!Array.isArray(value)) throw new Error(`${what} must be a list of pins`);
    return value.map((p: unknown) => (p === null ? null : num(p, what)));
  };
  const linePins = (value: unknown, what: string): LinePin[] => {
    if (!Array.isArray(value)) throw new Error(`${what} must be a list of pins or shift register outputs`);
    return value.map((p: unknown): LinePin => {
      if (p === null) return null;
      if (typeof p === 'number' && Number.isFinite(p)) return p;
      if (isRecord(p) && typeof p.sr === 'number' && Number.isInteger(p.sr) && p.sr >= 0) return { sr: p.sr };
      throw new Error(`${what} must be a list of pins or shift register outputs`);
    });
  };

  const w = data.wiring;
  if (!isRecord(w)) throw new Error('wiring is missing');
  let wiring: Wiring;
  if (w.kind === 'matrix') {
    if (w.diodeDirection !== 'col2row' && w.diodeDirection !== 'row2col') throw new Error('diodeDirection must be col2row or row2col');
    const matrix: MatrixWiring = { kind: 'matrix', diodeDirection: w.diodeDirection, rows: linePins(w.rows, 'wiring.rows'), cols: linePins(w.cols, 'wiring.cols') };
    if (w.right !== undefined) {
      if (!isRecord(w.right)) throw new Error('wiring.right must be an object');
      matrix.right = { rows: linePins(w.right.rows, 'wiring.right.rows'), cols: linePins(w.right.cols, 'wiring.right.cols') };
    }
    wiring = matrix;
  } else if (w.kind === 'direct') {
    const direct: DirectWiring = { kind: 'direct', pins: pins(w.pins, 'wiring.pins') };
    if (w.right !== undefined) direct.right = pins(w.right, 'wiring.right');
    wiring = direct;
  } else {
    throw new Error('wiring.kind must be matrix or direct');
  }

  if (!Array.isArray(data.keys)) throw new Error('keys is missing');
  const keys = data.keys.map((k: unknown, i: number): HardwareKey => {
    if (!isRecord(k)) throw new Error(`key ${i} isn’t an object`);
    const n = (field: string) => num(k[field], `key ${i} ${field}`);
    const key: HardwareKey = { x: n('x'), y: n('y'), w: n('w'), h: n('h'), r: n('r'), rx: n('rx'), ry: n('ry'), row: n('row'), col: n('col') };
    if (k.side === 'left' || k.side === 'right') key.side = k.side;
    return key;
  });
  const encoders = (value: unknown, what: string): Encoder[] => {
    if (!Array.isArray(value)) throw new Error(`${what} must be a list`);
    return value.map((e: unknown, i: number) => {
      if (!isRecord(e)) throw new Error(`${what} ${i} isn’t an object`);
      return { a: e.a === null ? null : num(e.a, `${what} ${i} a`), b: e.b === null ? null : num(e.b, `${what} ${i} b`) };
    });
  };
  const hardware: KeyboardHardware = {
    name: str(data.name, 'name'),
    displayName: str(data.displayName, 'displayName'),
    controller: str(data.controller, 'controller'),
    split: data.split === true,
    wiring,
    keys,
  };
  if (data.encoders !== undefined) hardware.encoders = encoders(data.encoders, 'encoders');
  if (data.rightEncoders !== undefined) hardware.rightEncoders = encoders(data.rightEncoders, 'rightEncoders');
  if (data.displays !== undefined) {
    if (!isRecord(data.displays)) throw new Error('displays must be an object');
    const kind = (value: unknown, what: string): DisplayKind => {
      if (typeof value !== 'string' || !(DISPLAY_KINDS as string[]).includes(value)) throw new Error(`${what} must be one of ${DISPLAY_KINDS.join(', ')}`);
      return value as DisplayKind;
    };
    const displays: { left?: DisplayKind; right?: DisplayKind } = {};
    if (data.displays.left !== undefined) displays.left = kind(data.displays.left, 'displays.left');
    if (data.displays.right !== undefined) displays.right = kind(data.displays.right, 'displays.right');
    hardware.displays = displays;
  }
  if (data.displayPins !== undefined) {
    if (!isRecord(data.displayPins)) throw new Error('displayPins must be an object');
    const displayPins: NonNullable<KeyboardHardware['displayPins']> = {};
    for (const side of ['left', 'right'] as const) {
      const half = data.displayPins[side];
      if (half === undefined) continue;
      if (!isRecord(half)) throw new Error(`displayPins.${side} must be an object`);
      const overrides: DisplayPinOverrides = {};
      for (const [signal, pin] of Object.entries(half)) {
        if (!(DISPLAY_SIGNALS as string[]).includes(signal)) throw new Error(`displayPins.${side}.${signal} isn’t a display signal`);
        overrides[signal as DisplaySignal] = pin === null ? null : num(pin, `displayPins.${side}.${signal}`);
      }
      if (Object.keys(overrides).length > 0) displayPins[side] = overrides;
    }
    // Empty ones would only turn the file into version 2.
    if (displayPins.left || displayPins.right) hardware.displayPins = displayPins;
  }
  if (data.shiftRegisters !== undefined) {
    const sr = data.shiftRegisters;
    if (!isRecord(sr)) throw new Error('shiftRegisters must be an object');
    const optionalPin = (value: unknown, what: string): Pin => (value === null ? null : num(value, what));
    const shiftRegisters: ShiftRegisters = { count: num(sr.count, 'shiftRegisters.count'), latch: optionalPin(sr.latch, 'shiftRegisters.latch') };
    if (sr.data !== undefined) shiftRegisters.data = optionalPin(sr.data, 'shiftRegisters.data');
    if (sr.clock !== undefined) shiftRegisters.clock = optionalPin(sr.clock, 'shiftRegisters.clock');
    if (sr.ownBus === true) shiftRegisters.ownBus = true;
    hardware.shiftRegisters = shiftRegisters;
  }
  if (data.encoderSpots !== undefined) {
    if (!Array.isArray(data.encoderSpots)) throw new Error('encoderSpots must be a list');
    // Only where knobs are drawn: a bad entry falls back to the default spot rather than failing the keyboard.
    hardware.encoderSpots = data.encoderSpots.map((s: unknown) =>
      isRecord(s) && typeof s.x === 'number' && Number.isFinite(s.x) && typeof s.y === 'number' && Number.isFinite(s.y) ? { x: s.x, y: s.y } : null,
    );
  }
  return hardware;
}
