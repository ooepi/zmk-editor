import { describe, expect, it } from 'vitest';
import { addEncoder, carryEncoderOrigins, removeEncoder, sensorLabel, sensorOrder } from './encoders.ts';
import { testPad, testSplit } from './testFixtures.ts';
import { hardwareLayout, type KeyboardHardware } from './types.ts';
import { halfEncoders, pinUses, setEncoderPin, setPin, setRightWiredDifferently } from './wiring.ts';

const split: KeyboardHardware = { ...testSplit, encoders: [{ a: 8, b: 9 }] };

describe('encoders', () => {
  it('mirrors the left encoders on the right with A and B swapped', () => {
    expect(halfEncoders(split, 'left')).toEqual([{ a: 8, b: 9 }]);
    expect(halfEncoders(split, 'right')).toEqual([{ a: 9, b: 8 }]);
    expect(sensorOrder(split).map(({ side, index }) => [side, index])).toEqual([['left', 0], ['right', 0]]);
    expect(sensorOrder({ ...testPad, encoders: [{ a: 8, b: 9 }] }).map(({ side, index }) => [side, index])).toEqual([[undefined, 0]]);
    expect(sensorOrder(testSplit)).toEqual([]);
  });

  it('names sensors like the Sofle', () => {
    expect(sensorLabel('left', 0)).toBe('left_encoder_0');
    expect(sensorLabel('right', 1)).toBe('right_encoder_1');
    expect(sensorLabel(undefined, 0)).toBe('encoder_0');
  });

  it('sets encoder pins; a right-half pin gives the right half its own pins and encoders', () => {
    expect(setEncoderPin(split, 'left', 0, 'b', 10).encoders).toEqual([{ a: 8, b: 10 }]);
    const right = setPin(split, 'right', 'encoderA', 0, 16);
    expect(right.rightEncoders).toEqual([{ a: 16, b: 8 }]);
    expect(right.wiring).toHaveProperty('right');
    expect(right.encoders).toEqual([{ a: 8, b: 9 }]);
  });

  it('copies the encoders when the right half is wired differently, and drops them when it mirrors again', () => {
    const on = setRightWiredDifferently(split, true);
    expect(on.rightEncoders).toEqual([{ a: 9, b: 8 }]);
    expect(setRightWiredDifferently(on, false)).not.toHaveProperty('rightEncoders');
  });

  it('lists encoder pins among the pin uses', () => {
    expect(pinUses(split, 'left').get(8)).toEqual(['Encoder 0 A']);
    expect(pinUses(split, 'right').get(8)).toEqual(['Encoder 0 B']);
  });

  it('adds and removes encoders, keeping each remaining encoder’s origin', () => {
    // Mirrored: adding on the left adds on both halves. Sensor order: left 0, left 1, right 0, right 1.
    const added = addEncoder({ hw: split, origins: [0, 1] }, 'left');
    expect(added.hw.encoders).toEqual([{ a: 8, b: 9 }, { a: null, b: null }]);
    expect(added.origins).toEqual([0, undefined, 1, undefined]);
    const removed = removeEncoder(added, 'left', 0);
    expect(removed.hw.encoders).toEqual([{ a: null, b: null }]);
    expect(removed.origins).toEqual([undefined, undefined]);
    // The right half's own encoders change on their own.
    const own = setRightWiredDifferently(split, true);
    const rightOnly = removeEncoder({ hw: own, origins: [0, 1] }, 'right', 0);
    expect(rightOnly.hw.rightEncoders).toEqual([]);
    expect(rightOnly.hw.encoders).toEqual([{ a: 8, b: 9 }]);
    expect(rightOnly.origins).toEqual([0]);
  });

  it('keeps origins aligned when the right half starts mirroring again', () => {
    const own = { ...setRightWiredDifferently(split, true), rightEncoders: [] };
    // Sensor order before: left 0 only. After mirroring: left 0, right 0 (new).
    expect(carryEncoderOrigins(own, setRightWiredDifferently(own, false), [5])).toEqual([5, undefined]);
  });
});

describe('a right half with its own pins but no encoder list (made before encoders existed)', () => {
  const stage1 = { ...testSplit, wiring: { kind: 'matrix', diodeDirection: 'col2row', rows: [4], cols: [6, 7], right: { rows: [4], cols: [7, 6] } } } as KeyboardHardware;

  it('has no right-half encoders, and an encoder added on the left stays on the left', () => {
    expect(halfEncoders(stage1, 'right')).toEqual([]);
    const added = addEncoder({ hw: stage1, origins: [] }, 'left');
    expect(halfEncoders(added.hw, 'right')).toEqual([]);
    expect(added.origins).toEqual([undefined]);
  });

  it('adds an encoder on the right half to the right half', () => {
    const added = addEncoder({ hw: stage1, origins: [] }, 'right');
    expect(added.hw.rightEncoders).toEqual([{ a: null, b: null }]);
    expect(added.hw.encoders ?? []).toEqual([]);
  });
});

describe('encoder knob positions', () => {
  it('move with their encoders when encoders are added or removed', () => {
    const spot = { x: 700, y: 300 };
    // Mirrored split: sensors left 0, right 0. The right knob has a spot.
    const withSpot = { ...split, encoderSpots: [null, spot] };
    const added = addEncoder({ hw: withSpot, origins: [0, 1] }, 'left');
    // Sensors now: left 0, left 1, right 0, right 1.
    expect(added.hw.encoderSpots).toEqual([null, null, spot, null]);
    const removed = removeEncoder(added, 'left', 0);
    // left 0 (was left 1), right 0 (was right 1): the spot went with the removed right 0, so none are left.
    expect(removed.hw.encoderSpots).toBeUndefined();
  });

  it('are part of the keyboard’s layout', () => {
    expect(hardwareLayout({ ...split, encoderSpots: [{ x: 1, y: 2 }, null] }).encoders).toEqual([{ x: 1, y: 2 }, null]);
    expect(hardwareLayout(split).encoders).toBeUndefined();
  });
});
