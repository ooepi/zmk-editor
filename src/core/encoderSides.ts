import { findKeyboard } from './catalog/keyboards.ts';
import type { ZmkConfig } from './config.ts';
import { sensorOrder } from './hardware/encoders.ts';
import type { Side } from './hardware/types.ts';

/**
 * Which half each encoder (in `sensor-bindings` order) is on: a designed keyboard's wiring, else
 * what the catalog read from the shield's sensors; undefined where nobody knows.
 */
export function encoderSides(config: Pick<ZmkConfig, 'keyboard' | 'hardware'>): (Side | undefined)[] {
  if (config.hardware) return sensorOrder(config.hardware).map((s) => s.side);
  return (findKeyboard(config.keyboard)?.encoders ?? []).map((side) => side ?? undefined);
}
