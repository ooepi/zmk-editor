import type { TextLayout } from './types.ts';

const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i);
const gap = (count: number) => Array.from({ length: count }, (): null => null);

/** Lily58: four 6+6 rows (the bottom one with two inner keys) and an 8-key thumb row. */
export const lily58TextLayout: TextLayout = {
  name: 'lily58',
  rows: [
    [...range(0, 6), ...gap(2), ...range(6, 6)],
    [...range(12, 6), ...gap(2), ...range(18, 6)],
    [...range(24, 6), ...gap(2), ...range(30, 6)],
    [...range(36, 7), ...range(43, 7)],
    [...gap(3), ...range(50, 8), ...gap(3)],
  ],
};
