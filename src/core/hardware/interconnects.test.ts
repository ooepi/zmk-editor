import { describe, expect, it } from 'vitest';
import { HARDWARE_CONTROLLERS } from './controllers.ts';
import { interconnectOf, nrfPin, pinLabel, PRO_MICRO, SEEED_XIAO } from './interconnects.ts';

const labels = (pads: { label: string }[]) => pads.map((p) => p.label);

describe('interconnects', () => {
  it('lists the 18 &pro_micro pins ZMK maps', () => {
    expect(PRO_MICRO.pins).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 15, 16, 18, 19, 20, 21]);
    expect(PRO_MICRO.header.left).toHaveLength(12);
    expect(PRO_MICRO.header.right).toHaveLength(12);
    expect(PRO_MICRO.header.left[0]?.mcu?.nice_nano_v2).toBe('P0.06');
    expect(PRO_MICRO.header.left[0]?.mcu?.puchi_ble_v1).toBe('P0.06');
    expect(pinLabel(4)).toBe('D4');
  });

  it('draws the Seeed XIAO’s 11 pins and power pads, USB at the top', () => {
    expect(SEEED_XIAO.pins).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(labels(SEEED_XIAO.header.left)).toEqual(['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6']);
    expect(labels(SEEED_XIAO.header.right)).toEqual(['5V', 'GND', '3V3', 'D10', 'D9', 'D8', 'D7']);
    expect(SEEED_XIAO.header.left[4]?.mcu).toEqual({ seeeduino_xiao_ble: 'P0.04' });
    expect(SEEED_XIAO.header.right[3]?.mcu).toEqual({ seeeduino_xiao_ble: 'P1.15' });
  });

  it('uses ZMK’s node labels and I2C pins for each', () => {
    expect([PRO_MICRO.gpio, PRO_MICRO.i2c, PRO_MICRO.i2cPins]).toEqual(['pro_micro', 'pro_micro_i2c', { sda: 2, scl: 3 }]);
    expect([SEEED_XIAO.gpio, SEEED_XIAO.i2c, SEEED_XIAO.i2cPins]).toEqual(['xiao_d', 'xiao_i2c', { sda: 4, scl: 5 }]);
    expect([PRO_MICRO.niceViewAdapter, SEEED_XIAO.niceViewAdapter]).toEqual([true, false]);
  });

  it('finds a controller’s interconnect, the Pro Micro when unknown', () => {
    expect(interconnectOf('nice_nano_v2')).toBe(PRO_MICRO);
    expect(interconnectOf('seeeduino_xiao_ble')).toBe(SEEED_XIAO);
    expect(interconnectOf('nope')).toBe(PRO_MICRO);
  });
});

describe('nrfPin', () => {
  it('maps D-pins to each board’s nRF52840 pins, from ZMK v0.3', () => {
    expect(nrfPin('nice_nano_v2', 2)).toEqual({ port: 0, pin: 17 });
    expect(nrfPin('nice_nano', 18)).toEqual({ port: 1, pin: 15 });
    expect(nrfPin('puchi_ble_v1', 2)).toEqual({ port: 0, pin: 15 });
    expect(nrfPin('nrfmicro_13', 20)).toEqual({ port: 0, pin: 31 });
    expect(nrfPin('bluemicro840_v1', 20)).toEqual({ port: 0, pin: 26 });
    expect(nrfPin('nrfmicro_11_flipped', 2)).toEqual({ port: 0, pin: 30 });
    expect(nrfPin('mikoto', 6)).toEqual({ port: 1, pin: 0 });
    expect(nrfPin('mikoto', 0)).toEqual({ port: 0, pin: 4 });
    expect(nrfPin('seeeduino_xiao_ble', 10)).toEqual({ port: 1, pin: 15 });
    expect(nrfPin('nice_nano_v2', 11)).toBeUndefined();
    expect(nrfPin('nope', 2)).toBeUndefined();
  });

  it('knows every pin of every controller the wizard offers', () => {
    for (const c of HARDWARE_CONTROLLERS) {
      for (const pin of interconnectOf(c.id).pins) expect(nrfPin(c.id, pin), `${c.id} D${pin}`).toBeDefined();
    }
  });
});

describe('HARDWARE_CONTROLLERS', () => {
  it('offers wireless nRF52840 controllers with a known footprint', () => {
    const ids = HARDWARE_CONTROLLERS.map((c) => c.id);
    expect(ids).toContain('nice_nano_v2');
    expect(ids).toContain('puchi_ble_v1');
    expect(ids).toContain('seeeduino_xiao_ble');
    expect(ids).not.toContain('sparkfun_pro_micro_rp2040');
    expect(ids).not.toContain('seeeduino_xiao_rp2040');
    expect(ids).not.toContain('nrfmicro_13_52833');
  });
});
