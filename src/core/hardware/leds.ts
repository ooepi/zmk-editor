import { pinLabel } from './interconnects.ts';
import type { KeyboardHardware, Leds, Pin, Side } from './types.ts';
import { setRightWiredDifferently } from './wiring.ts';

export type LedSignal = 'data' | 'backlight' | 'power';

/** What each LED pin is used for, as shown in pin uses. */
export const LED_USES: Record<LedSignal, string> = { data: 'LED data', backlight: 'Backlight', power: 'LED power' };

export const MAX_LEDS = 256;

/**
 * Each controller's own switchable 3.3V pin (ZMK's `EXT_POWER` in its v0.3 board file).
 * With an LED power pin, ZMK's external power drives that instead, and this pin is held on.
 * The XIAO has none.
 */
export const BOARD_POWER: Record<string, { gpio: 'gpio0' | 'gpio1'; pin: number; flags: 'GPIO_ACTIVE_HIGH' | 'GPIO_ACTIVE_LOW' }> = {
  nice_nano: { gpio: 'gpio0', pin: 13, flags: 'GPIO_ACTIVE_LOW' },
  nice_nano_v2: { gpio: 'gpio0', pin: 13, flags: 'GPIO_ACTIVE_HIGH' },
  nrfmicro_11: { gpio: 'gpio1', pin: 9, flags: 'GPIO_ACTIVE_HIGH' },
  nrfmicro_11_flipped: { gpio: 'gpio1', pin: 9, flags: 'GPIO_ACTIVE_HIGH' },
  nrfmicro_13: { gpio: 'gpio1', pin: 9, flags: 'GPIO_ACTIVE_LOW' },
  puchi_ble_v1: { gpio: 'gpio1', pin: 9, flags: 'GPIO_ACTIVE_LOW' },
  bluemicro840_v1: { gpio: 'gpio0', pin: 12, flags: 'GPIO_ACTIVE_HIGH' },
  mikoto: { gpio: 'gpio0', pin: 13, flags: 'GPIO_ACTIVE_HIGH' },
};

/** A half's LEDs. A mirrored right half copies the left's; a right half with its own pins has its own (or none). */
export function halfLeds(hw: KeyboardHardware, side?: Side): Leds | undefined {
  if (side !== 'right') return hw.leds;
  if (hw.rightLeds) return hw.rightLeds;
  return hw.wiring.right ? undefined : hw.leds;
}

const sides = (hw: KeyboardHardware): (Side | undefined)[] => (hw.split ? ['left', 'right'] : [undefined]);

export const hasUnderglow = (hw: KeyboardHardware) => sides(hw).some((s) => halfLeds(hw, s)?.underglow !== undefined);
export const hasBacklight = (hw: KeyboardHardware) => sides(hw).some((s) => halfLeds(hw, s)?.backlight !== undefined);

/** Replaces a half's LEDs; a half with neither kind loses its whole block, power pin included. */
function putLeds(hw: KeyboardHardware, side: Side | undefined, leds: Leds): KeyboardHardware {
  const right = side === 'right';
  const next = right && !hw.rightLeds ? setRightWiredDifferently(hw, true) : { ...hw };
  const keep = leds.underglow !== undefined || leds.backlight !== undefined;
  if (right) {
    if (keep) next.rightLeds = leds;
    else delete next.rightLeds;
  } else if (keep) next.leds = leds;
  else delete next.leds;
  return next;
}

const current = (hw: KeyboardHardware, side: Side | undefined): Leds => ({ ...halfLeds(hw, side) });

export function setUnderglow(hw: KeyboardHardware, side: Side | undefined, on: boolean): KeyboardHardware {
  const leds = current(hw, side);
  if (on) leds.underglow = leds.underglow ?? { data: null, count: 1 };
  else delete leds.underglow;
  return putLeds(hw, side, leds);
}

export function setBacklight(hw: KeyboardHardware, side: Side | undefined, on: boolean): KeyboardHardware {
  const leds = current(hw, side);
  if (on) leds.backlight = leds.backlight ?? { pin: null };
  else delete leds.backlight;
  return putLeds(hw, side, leds);
}

export function setLedCount(hw: KeyboardHardware, side: Side | undefined, count: number): KeyboardHardware {
  const leds = current(hw, side);
  if (!leds.underglow) return hw;
  return putLeds(hw, side, { ...leds, underglow: { ...leds.underglow, count } });
}

/** Sets an LED pin; no pin for the power switch removes it. */
export function setLedPin(hw: KeyboardHardware, side: Side | undefined, signal: LedSignal, pin: Pin): KeyboardHardware {
  const leds = current(hw, side);
  if (signal === 'data' && leds.underglow) leds.underglow = { ...leds.underglow, data: pin };
  else if (signal === 'backlight' && leds.backlight) leds.backlight = { pin };
  else if (signal === 'power' && (leds.underglow || leds.backlight)) {
    if (pin === null) delete leds.power;
    else leds.power = pin;
  } else return hw;
  return putLeds(hw, side, leds);
}

/** A half's LED pins with their uses, in the order data, backlight, power (only when set). */
export function ledPins(hw: KeyboardHardware, side?: Side): { pin: Pin; use: string }[] {
  const leds = halfLeds(hw, side);
  if (!leds) return [];
  return [
    ...(leds.underglow ? [{ pin: leds.underglow.data, use: LED_USES.data }] : []),
    ...(leds.backlight ? [{ pin: leds.backlight.pin, use: LED_USES.backlight }] : []),
    ...(leds.power !== undefined ? [{ pin: leds.power, use: LED_USES.power }] : []),
  ];
}

const on = (pin: Pin) => (pin === null ? 'no pin' : pinLabel(pin));

/** "20 RGB LEDs on D4, backlight on D6, power switch on D5"; undefined without LEDs. */
export function ledSummary(hw: KeyboardHardware, side?: Side): string | undefined {
  const leds = halfLeds(hw, side);
  if (!leds) return undefined;
  const parts = [
    ...(leds.underglow ? [`${leds.underglow.count} RGB LED${leds.underglow.count === 1 ? '' : 's'} on ${on(leds.underglow.data)}`] : []),
    ...(leds.backlight ? [`backlight on ${on(leds.backlight.pin)}`] : []),
    ...(leds.power !== undefined ? [`power switch on ${on(leds.power)}`] : []),
  ];
  const text = parts.join(', ');
  return parts.length > 0 ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : undefined;
}
