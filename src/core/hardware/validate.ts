import { findKeyboard } from '../catalog/keyboards.ts';
import { MODULES } from '../catalog/modules.ts';
import { HARDWARE_CONTROLLERS, PRO_MICRO_PINS } from './controllers.ts';
import type { HardwareBasics } from './grid.ts';
import type { KeyboardHardware, Pin } from './types.ts';
import { directPins, halfEncoders, halfSize, halves, matrixPins } from './wiring.ts';

/** Ids ZMK reserves itself, in addition to catalog keyboards and every module shield id. */
const RESERVED_IDS = new Set([
  'nice_view',
  'nice_view_adapter',
  'settings_reset',
  'studio_rpc_usb_uart',
  ...MODULES.map((m) => m.shield?.name).filter((name): name is string => name !== undefined),
]);

export interface HardwareIssue {
  level: 'error' | 'warning';
  /** The wizard step that fixes it. */
  area: 'basics' | 'wiring' | 'keys';
  message: string;
  /** Keys involved, for highlighting. */
  keys?: number[];
}

const MAX_NAME = 16;

export const hasErrors = (issues: HardwareIssue[]) => issues.some((i) => i.level === 'error');

function identityIssues(name: string, displayName: string, controller: string): HardwareIssue[] {
  const messages: string[] = [];
  if (!/^[a-z][a-z0-9_]*$/.test(name)) messages.push(`The id “${name}” must start with a letter and use only a–z, 0–9 and _.`);
  else if (findKeyboard(name)) messages.push(`“${name}” is already a keyboard in ZMK; pick another id.`);
  else if (RESERVED_IDS.has(name)) messages.push(`“${name}” is already used by ZMK or a module; pick another id.`);
  if (!displayName.trim()) messages.push('Give the keyboard a name.');
  else if (displayName.length > MAX_NAME) messages.push(`The name “${displayName}” is longer than ${MAX_NAME} characters, the Bluetooth limit.`);
  if (/["\\]/.test(displayName)) messages.push('The name can’t contain " or \\.');
  else if (/[^\x20-\x7e]|\$/.test(displayName)) {
    messages.push('The name can only use plain letters, digits, spaces and punctuation (no accents or $), because it becomes the Bluetooth name.');
  }
  if (!HARDWARE_CONTROLLERS.some((c) => c.id === controller)) messages.push(`${controller} isn’t a supported controller.`);
  return messages.map((message) => ({ level: 'error', area: 'basics', message }));
}

export function validateBasics(b: HardwareBasics): HardwareIssue[] {
  const issues = identityIssues(b.name, b.displayName, b.controller);
  const error = (message: string) => issues.push({ level: 'error', area: 'basics', message });
  if (!Number.isInteger(b.rows) || b.rows < 1) error('Use at least 1 row.');
  if (!Number.isInteger(b.cols) || b.cols < 1) error('Use at least 1 column.');
  if (issues.length > 0) return issues;
  const perHalf = b.split ? ' per half' : '';
  if (b.wiring === 'matrix' && b.rows + b.cols > PRO_MICRO_PINS.length) {
    error(`A ${b.rows} × ${b.cols} matrix needs ${b.rows + b.cols} pins${perHalf}, but the controller has ${PRO_MICRO_PINS.length}.`);
  }
  if (b.wiring === 'direct' && b.rows * b.cols > PRO_MICRO_PINS.length) {
    error(`Direct wiring for ${b.rows * b.cols} keys needs ${b.rows * b.cols} pins${perHalf}, but the controller has ${PRO_MICRO_PINS.length}.`);
  }
  return issues;
}

export function validateHardware(hw: KeyboardHardware): HardwareIssue[] {
  const issues = identityIssues(hw.name, hw.displayName, hw.controller);
  const add = (level: HardwareIssue['level'], area: HardwareIssue['area'], message: string, keys?: number[]) => {
    if (!issues.some((i) => i.message === message)) issues.push({ level, area, message, ...(keys ? { keys } : {}) });
  };
  if (hw.keys.length === 0) add('error', 'keys', 'The keyboard has no keys.');
  const direct = hw.wiring.kind === 'direct';

  for (const side of halves(hw)) {
    const where = side ? ` on the ${side} half` : '';

    // A mirrored right half uses the left's pins, so they're checked once.
    if (side !== 'right' || hw.wiring.right || hw.rightEncoders) {
      const labelled: { label: string; pin: Pin }[] = [
        ...(hw.wiring.kind === 'direct'
          ? directPins(hw.wiring, side).map((pin, i) => ({ label: `Input ${i}`, pin }))
          : [
              ...matrixPins(hw.wiring, side).rows.map((pin, i) => ({ label: `Row ${i}`, pin })),
              ...matrixPins(hw.wiring, side).cols.map((pin, i) => ({ label: `Column ${i}`, pin })),
            ]),
        ...halfEncoders(hw, side).flatMap((e, i) => [
          { label: `Encoder ${i} A`, pin: e.a },
          { label: `Encoder ${i} B`, pin: e.b },
        ]),
      ];
      if (labelled.length > PRO_MICRO_PINS.length) {
        add('error', 'wiring', `The wiring${where} needs ${labelled.length} pins, but the controller has ${PRO_MICRO_PINS.length}.`);
      }
      const seen = new Map<number, string>();
      for (const { label, pin } of labelled) {
        const other = pin === null ? undefined : seen.get(pin);
        if (pin === null) add('error', 'wiring', `${label}${where} has no pin.`);
        else if (!PRO_MICRO_PINS.includes(pin)) add('error', 'wiring', `${label}${where} uses D${pin}, which isn’t a Pro Micro pin.`);
        else if (other !== undefined) add('error', 'wiring', `D${pin} is used for both ${other} and ${label}${where}.`);
        else seen.set(pin, label);
      }
    }

    const size = halfSize(hw, side);
    const onHalf = hw.keys.map((key, index) => ({ key, index })).filter(({ key }) => !hw.split || key.side === side);
    if (side && hw.keys.length > 0 && onHalf.length === 0) add('warning', 'keys', `The ${side} half has no keys.`);
    const taken = new Map<string, number>();
    for (const { key, index } of onHalf) {
      const inside = Number.isInteger(key.row) && Number.isInteger(key.col) && key.row >= 0 && key.col >= 0 && key.row < size.rows && key.col < size.cols;
      if (!inside) {
        add('error', 'keys', direct
          ? `Key ${index} uses input ${key.col}${where}, but there are only ${size.cols}.`
          : `Key ${index} is on row ${key.row}, column ${key.col}${where}, outside the ${size.rows} × ${size.cols} matrix.`, [index]);
        continue;
      }
      const spot = `${key.row},${key.col}`;
      const other = taken.get(spot);
      if (other === undefined) taken.set(spot, index);
      else add('error', 'keys', direct
        ? `Keys ${other} and ${index} both use input ${key.col}${where}.`
        : `Keys ${other} and ${index} are both on row ${key.row}, column ${key.col}${where}.`, [other, index]);
    }
    if (onHalf.length > 0) {
      const used = [...taken.keys()].map((s) => s.split(',').map(Number) as [number, number]);
      if (direct) {
        for (let c = 0; c < size.cols; c++) if (!used.some(([, col]) => col === c)) add('warning', 'keys', `Input ${c}${where} has no key.`);
      } else {
        for (let r = 0; r < size.rows; r++) if (!used.some(([row]) => row === r)) add('warning', 'keys', `Row ${r}${where} has no keys.`);
        for (let c = 0; c < size.cols; c++) if (!used.some(([, col]) => col === c)) add('warning', 'keys', `Column ${c}${where} has no keys.`);
      }
    }
  }
  if (hw.split) {
    hw.keys.forEach((key, index) => {
      if (key.side !== 'left' && key.side !== 'right') add('error', 'keys', `Key ${index} isn’t on a half.`, [index]);
    });
  }
  return issues;
}
