import { describe, expect, it } from 'vitest';
import { padClass } from './components/padClass.ts';

describe('padClass', () => {
  it('colours shift register pins, and a pin shared by the nice!view and the shift registers isn’t a clash', () => {
    expect(padClass(['Shift register latch'])).toBe('use-shift');
    expect(padClass(['Display data', 'Shift register data'], true)).toBe('use-shift');
    expect(padClass(['Display data', 'Shift register clock'], true)).toBe('use-clash');
    expect(padClass(['Row 0', 'Column 1'])).toBe('use-clash');
  });

  it('marks the display’s pins reused by shift registers on their own bus as a clash, as validation does', () => {
    expect(padClass(['Display data', 'Shift register data'], false)).toBe('use-clash');
    expect(padClass(['Display data', 'Shift register data'])).toBe('use-clash');
  });
});
