import { describe, expect, it } from 'vitest';
import type { ZmkConfig } from './config.ts';
import { encoderCount, encoderSides } from './encoderSides.ts';
import { testPad, testSplit } from './hardware/testFixtures.ts';
import { emptyKeymap } from './keymap/model.ts';

const config = (patch: Partial<ZmkConfig>): ZmkConfig => ({
  keyboard: 'lily58',
  keymap: emptyKeymap(),
  kconfig: { lines: [] },
  west: { zmkVersion: 'v0.3', modules: [], selfPath: 'config' },
  build: { include: [] },
  ...patch,
});

describe('encoderSides', () => {
  it('reads catalog keyboards from their shield’s sensors', () => {
    expect(encoderSides(config({ keyboard: 'lily58' }))).toEqual(['left']);
    expect(encoderSides(config({ keyboard: 'sofle' }))).toEqual(['left', 'right']);
  });

  it('follows a designed keyboard’s wiring, left then right', () => {
    const encoder = { a: 2, b: 3 };
    expect(encoderSides(config({ keyboard: 'test_split', hardware: { ...testSplit, encoders: [encoder] } }))).toEqual(['left', 'right']);
    expect(encoderSides(config({ keyboard: 'test_pad', hardware: { ...testPad, encoders: [encoder] } }))).toEqual([undefined]);
  });

  it('knows nothing about other keyboards', () => {
    expect(encoderSides(config({ keyboard: 'no_such_board' }))).toEqual([]);
  });
});

describe('encoderCount', () => {
  it('counts the encoders the keyboard has, even ones whose bindings all fall through', () => {
    expect(encoderCount(config({ keyboard: 'sofle' }))).toBe(2);
    expect(encoderCount(config({ keyboard: 'no_such_board' }))).toBe(0);
  });
});
