import { isRecord } from '../files/yaml-util.ts';
import { DISPLAY_KINDS } from './displays.ts';
import type { DirectWiring, DisplayKind, Encoder, HardwareKey, KeyboardHardware, MatrixWiring, Pin, Wiring } from './types.ts';

const VERSION = 1;

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
      version: VERSION,
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
      keys: [],
    },
    null,
    2,
  );
  const keys = hw.keys.map(({ x, y, w: width, h, r, rx, ry, row, col, side }) =>
    JSON.stringify({ x, y, w: width, h, r, rx, ry, row, col, ...(side ? { side } : {}) }),
  );
  const list = keys.length > 0 ? `[\n${keys.map((k) => `    ${k}`).join(',\n')}\n  ]` : '[]';
  return `${head.replace('"keys": []', `"keys": ${list}`)}\n`;
}

export function parseHardware(text: string): KeyboardHardware {
  const data: unknown = JSON.parse(text);
  if (!isRecord(data)) throw new Error('it isn’t a JSON object');
  if (data.version !== VERSION) throw new Error(`version ${String(data.version)} isn’t supported; update the editor`);
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

  const w = data.wiring;
  if (!isRecord(w)) throw new Error('wiring is missing');
  let wiring: Wiring;
  if (w.kind === 'matrix') {
    if (w.diodeDirection !== 'col2row' && w.diodeDirection !== 'row2col') throw new Error('diodeDirection must be col2row or row2col');
    const matrix: MatrixWiring = { kind: 'matrix', diodeDirection: w.diodeDirection, rows: pins(w.rows, 'wiring.rows'), cols: pins(w.cols, 'wiring.cols') };
    if (w.right !== undefined) {
      if (!isRecord(w.right)) throw new Error('wiring.right must be an object');
      matrix.right = { rows: pins(w.right.rows, 'wiring.right.rows'), cols: pins(w.right.cols, 'wiring.right.cols') };
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
  return hardware;
}
