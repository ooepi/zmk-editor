import { findKeyboard } from './catalog/keyboards.ts';
import type { ZmkConfig } from './config.ts';
import { sensorOrder } from './hardware/encoders.ts';
import type { Side } from './hardware/types.ts';
import { sensorCount } from './keymap/sensorEdit.ts';
import { placeEncoders } from './layouts/encoders.ts';
import type { EncoderSpot, PhysicalLayout } from './layouts/types.ts';

/**
 * Which half each encoder (in `sensor-bindings` order) is on: a designed keyboard's wiring, else
 * what the catalog read from the shield's sensors; undefined where nobody knows.
 */
export function encoderSides(config: Pick<ZmkConfig, 'keyboard' | 'hardware'>): (Side | undefined)[] {
  if (config.hardware) return sensorOrder(config.hardware).map((s) => s.side);
  return (findKeyboard(config.keyboard)?.encoders ?? []).map((side) => side ?? undefined);
}

/** How many encoder knobs to draw: the keyboard's encoders, or more if the keymap binds more. */
export function encoderCount(config: Pick<ZmkConfig, 'keyboard' | 'hardware' | 'keymap'>): number {
  return Math.max(sensorCount(config.keymap), encoderSides(config).length);
}

/**
 * Every encoder knob's spot on `layout` (the keyboard as drawn). A designed keyboard's own keys are
 * used for the halves, since they know which half they're wired to.
 */
export function knobSpots(config: Pick<ZmkConfig, 'keyboard' | 'hardware' | 'keymap'>, layout: PhysicalLayout): EncoderSpot[] {
  const keys = config.hardware && config.hardware.keys.length === layout.keys.length ? config.hardware.keys : layout.keys;
  return placeEncoders({ ...layout, keys }, encoderSides(config), encoderCount(config));
}
