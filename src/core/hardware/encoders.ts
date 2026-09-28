import type { Encoder, KeyboardHardware, Side } from './types.ts';
import { halfEncoders } from './wiring.ts';

/** An encoder as a keymap sensor; the order is left then right, as in the sensors node and `sensor-bindings`. */
export interface SensorRef {
  side?: Side;
  index: number;
  encoder: Encoder;
}

export function sensorOrder(hw: KeyboardHardware): SensorRef[] {
  const sides: (Side | undefined)[] = hw.split ? ['left', 'right'] : [undefined];
  return sides.flatMap((side) => halfEncoders(hw, side).map((encoder, index) => ({ ...(side ? { side } : {}), index, encoder })));
}

/** The devicetree label of an encoder, e.g. `left_encoder_0` (Sofle style) or `encoder_0`. */
export const sensorLabel = (side: Side | undefined, index: number) => (side ? `${side}_encoder_${index}` : `encoder_${index}`);

/** Hardware plus, per sensor (in `sensorOrder`), its index before this edit (undefined for new encoders). */
export interface EncoderDraft {
  hw: KeyboardHardware;
  origins: (number | undefined)[];
}

/** Which list holds a half's encoders: the right half's own, or the left's (also the mirror's source). */
const owner = (hw: KeyboardHardware, side: Side | undefined) => (side === 'right' && (hw.rightEncoders || hw.wiring.right) ? 'right' : 'left');

/** Maps origins from `before` to `after`; `map` gives the old index on the same half for a new (side, index). */
export function carryEncoderOrigins(
  before: KeyboardHardware,
  after: KeyboardHardware,
  origins: (number | undefined)[],
  map: (side: Side | undefined, index: number) => number | undefined = (_, index) => index,
): (number | undefined)[] {
  const old = sensorOrder(before);
  return sensorOrder(after).map(({ side, index }) => {
    const j = map(side, index);
    const at = j === undefined ? -1 : old.findIndex((s) => s.side === side && s.index === j);
    return at < 0 ? undefined : origins[at];
  });
}

export function addEncoder(draft: EncoderDraft, side?: Side): EncoderDraft {
  const list = owner(draft.hw, side);
  const blank = { a: null, b: null };
  const hw = list === 'right'
    ? { ...draft.hw, rightEncoders: [...(draft.hw.rightEncoders ?? []), blank] }
    : { ...draft.hw, encoders: [...(draft.hw.encoders ?? []), blank] };
  const oldCount = (s: Side | undefined) => halfEncoders(draft.hw, s).length;
  return {
    hw,
    origins: carryEncoderOrigins(draft.hw, hw, draft.origins, (s, i) => (owner(draft.hw, s) === list && i >= oldCount(s) ? undefined : i)),
  };
}

export function removeEncoder(draft: EncoderDraft, side: Side | undefined, index: number): EncoderDraft {
  const list = owner(draft.hw, side);
  const drop = (encoders: Encoder[] | undefined) => (encoders ?? []).filter((_, i) => i !== index);
  const hw = list === 'right' ? { ...draft.hw, rightEncoders: drop(draft.hw.rightEncoders) } : { ...draft.hw, encoders: drop(draft.hw.encoders) };
  return {
    hw,
    origins: carryEncoderOrigins(draft.hw, hw, draft.origins, (s, i) => (owner(draft.hw, s) === list && i >= index ? i + 1 : i)),
  };
}
