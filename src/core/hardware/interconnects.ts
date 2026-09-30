import { CONTROLLER_DATA } from '../catalog/keyboards.data.ts';

/** A pad on a controller's header; `pin` is its D-number, null for power pads. */
export interface HeaderPad {
  pin: number | null;
  label: string;
  /** The microcontroller pin behind the pad, per controller id, e.g. `{ nice_nano_v2: 'P0.06' }`. */
  mcu?: Record<string, string>;
}

/** A controller footprint ZMK knows as an interconnect: its pads and devicetree node labels. */
export interface Interconnect {
  /** ZMK's interconnect id, what a shield `requires`. */
  id: 'pro_micro' | 'seeed_xiao';
  name: string;
  /** The GPIO node label: `&pro_micro 4`, `&xiao_d 4`. */
  gpio: string;
  /** The I2C bus node label. */
  i2c: string;
  /** Seen from above with USB at the top: each side's pads, top to bottom. */
  header: { left: HeaderPad[]; right: HeaderPad[] };
  /** Every GPIO pad's D-number, sorted. */
  pins: number[];
  /** The I2C pads an OLED uses. */
  i2cPins: { sda: number; scl: number };
  /** Whether ZMK's nice!view adapter fits (its overlays only cover Pro Micro nRF52840 boards). */
  niceViewAdapter: boolean;
  /** A nice!view's default pins: the adapter's on a Pro Micro. */
  niceViewPins: { cs: number; data: number; clock: number };
}

const power = (label: string): HeaderPad => ({ pin: null, label });

function interconnect(fields: Omit<Interconnect, 'pins'>): Interconnect {
  const pins = [...fields.header.left, ...fields.header.right]
    .flatMap((p) => (p.pin === null ? [] : [p.pin]))
    .sort((a, b) => a - b);
  return { ...fields, pins };
}

/** nRF52840 pins behind D0–D21, from each board's arduino_pro_micro_pins*.dtsi in ZMK v0.3 (in D order: 0–10, 14–16, 18–21). */
const PRO_MICRO_D = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 15, 16, 18, 19, 20, 21];
const NICE_NANO = 'P0.08 P0.06 P0.17 P0.20 P0.22 P0.24 P1.00 P0.11 P1.04 P1.06 P0.09 P1.11 P1.13 P0.10 P1.15 P0.02 P0.29 P0.31';
const NRFMICRO = 'P0.08 P0.06 P0.15 P0.17 P0.20 P0.13 P0.24 P0.09 P0.10 P1.06 P1.11 P0.03 P1.13 P0.28 P0.02 P0.29 P0.31 P0.30';
const PRO_MICRO_MAPS: Record<string, string> = {
  nice_nano: NICE_NANO,
  nice_nano_v2: NICE_NANO,
  nrfmicro_11: NRFMICRO,
  nrfmicro_13: NRFMICRO,
  puchi_ble_v1: NRFMICRO,
  // Like the nRFMicro but D20 on P0.26.
  bluemicro840_v1: 'P0.08 P0.06 P0.15 P0.17 P0.20 P0.13 P0.24 P0.09 P0.10 P1.06 P1.11 P0.03 P1.13 P0.28 P0.02 P0.29 P0.26 P0.30',
  nrfmicro_11_flipped: 'P0.08 P0.06 P0.30 P0.31 P0.29 P0.02 P1.13 P0.03 P0.28 P1.11 P1.06 P0.09 P0.24 P0.10 P0.13 P0.20 P0.17 P0.15',
  // Revision 5.20.0, the board's default; 6.1.0 and later move D6 to P1.08.
  mikoto: 'P0.04 P0.08 P0.17 P0.20 P0.22 P0.24 P1.00 P1.02 P1.04 P1.06 P0.09 P1.13 P0.02 P0.10 P0.29 P0.31 P0.25 P0.11',
};

const proMicroPad = (pin: number): HeaderPad => ({
  pin,
  label: `D${pin}`,
  mcu: Object.fromEntries(Object.entries(PRO_MICRO_MAPS).map(([board, map]) => [board, map.split(' ')[PRO_MICRO_D.indexOf(pin)] ?? ''])),
});

/** Every `&pro_micro` pin is the same on every nRF52840 Pro Micro board in ZMK v0.3. */
export const PRO_MICRO: Interconnect = interconnect({
  id: 'pro_micro',
  name: 'Pro Micro',
  gpio: 'pro_micro',
  i2c: 'pro_micro_i2c',
  header: {
    left: [
      proMicroPad(1),
      proMicroPad(0),
      power('GND'),
      power('GND'),
      proMicroPad(2),
      proMicroPad(3),
      proMicroPad(4),
      proMicroPad(5),
      proMicroPad(6),
      proMicroPad(7),
      proMicroPad(8),
      proMicroPad(9),
    ],
    right: [
      power('RAW'),
      power('GND'),
      power('RST'),
      power('VCC'),
      proMicroPad(21),
      proMicroPad(20),
      proMicroPad(19),
      proMicroPad(18),
      proMicroPad(15),
      proMicroPad(14),
      proMicroPad(16),
      proMicroPad(10),
    ],
  },
  i2cPins: { sda: 2, scl: 3 },
  niceViewAdapter: true,
  niceViewPins: { cs: 1, data: 2, clock: 3 },
});

// XIAO nRF52840 pins from Zephyr's xiao_ble seeed_xiao_connector.dtsi (ZMK's v3.5.0+zmk-fixes).
const xiaoPad = (pin: number, nrf: string): HeaderPad => ({ pin, label: `D${pin}`, mcu: { seeeduino_xiao_ble: nrf } });

export const SEEED_XIAO: Interconnect = interconnect({
  id: 'seeed_xiao',
  name: 'Seeed XIAO',
  gpio: 'xiao_d',
  i2c: 'xiao_i2c',
  header: {
    left: [
      xiaoPad(0, 'P0.02'),
      xiaoPad(1, 'P0.03'),
      xiaoPad(2, 'P0.28'),
      xiaoPad(3, 'P0.29'),
      xiaoPad(4, 'P0.04'),
      xiaoPad(5, 'P0.05'),
      xiaoPad(6, 'P1.11'),
    ],
    right: [
      power('5V'),
      power('GND'),
      power('3V3'),
      xiaoPad(10, 'P1.15'),
      xiaoPad(9, 'P1.14'),
      xiaoPad(8, 'P1.13'),
      xiaoPad(7, 'P1.12'),
    ],
  },
  i2cPins: { sda: 4, scl: 5 },
  niceViewAdapter: false,
  // The XIAO's own SPI pads (SCK D8, MOSI D10), with CS on its unused MISO pad.
  niceViewPins: { cs: 9, data: 10, clock: 8 },
});

export const INTERCONNECTS: Interconnect[] = [PRO_MICRO, SEEED_XIAO];

/** The footprint a controller exposes; the Pro Micro for ids the catalog doesn't know. */
export function interconnectOf(controller: string): Interconnect {
  const exposes = CONTROLLER_DATA.find((c) => c.id === controller)?.exposes ?? [];
  return INTERCONNECTS.find((ic) => exposes.includes(ic.id)) ?? PRO_MICRO;
}

export const pinLabel = (pin: number) => `D${pin}`;

/** The nRF52840 port and pin behind a controller's D-pin, for pinctrl; undefined when unknown. */
export function nrfPin(controller: string, pin: number): { port: number; pin: number } | undefined {
  const { header } = interconnectOf(controller);
  const label = [...header.left, ...header.right].find((p) => p.pin === pin)?.mcu?.[controller];
  const match = label ? /^P(\d)\.(\d+)$/.exec(label) : null;
  return match ? { port: Number(match[1]), pin: Number(match[2]) } : undefined;
}
