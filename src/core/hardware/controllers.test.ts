import { describe, expect, it } from 'vitest';
import { HARDWARE_CONTROLLERS, PRO_MICRO_HEADER, PRO_MICRO_PINS, pinLabel, isNiceNano } from './controllers.ts';

describe('Pro Micro pins', () => {
  it('lists the 18 &pro_micro pins ZMK maps', () => {
    expect(PRO_MICRO_PINS).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 15, 16, 18, 19, 20, 21]);
    expect(PRO_MICRO_HEADER.left).toHaveLength(12);
    expect(PRO_MICRO_HEADER.right).toHaveLength(12);
    expect(pinLabel(4)).toBe('D4');
  });

  it('offers wireless nRF52840 Pro Micro controllers only', () => {
    const ids = HARDWARE_CONTROLLERS.map((c) => c.id);
    expect(ids).toContain('nice_nano_v2');
    expect(ids).toContain('puchi_ble_v1');
    expect(ids).not.toContain('sparkfun_pro_micro_rp2040');
    expect(ids).not.toContain('nrfmicro_13_52833');
    expect(ids).not.toContain('seeeduino_xiao_ble');
  });

  it('identifies nice!nano controllers by id', () => {
    expect(isNiceNano('nice_nano')).toBe(true);
    expect(isNiceNano('nice_nano_v2')).toBe(true);
    expect(isNiceNano('puchi_ble_v1')).toBe(false);
  });
});
