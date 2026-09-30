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

// nice!nano pins from ZMK's arduino_pro_micro_pins.dtsi (v0.3).
const proMicroPad = (pin: number, nrf: string): HeaderPad => ({
  pin,
  label: `D${pin}`,
  mcu: { nice_nano: nrf, nice_nano_v2: nrf },
});

/** Every `&pro_micro` pin is the same on every nRF52840 Pro Micro board in ZMK v0.3. */
export const PRO_MICRO: Interconnect = interconnect({
  id: 'pro_micro',
  name: 'Pro Micro',
  gpio: 'pro_micro',
  i2c: 'pro_micro_i2c',
  header: {
    left: [
      proMicroPad(1, 'P0.06'),
      proMicroPad(0, 'P0.08'),
      power('GND'),
      power('GND'),
      proMicroPad(2, 'P0.17'),
      proMicroPad(3, 'P0.20'),
      proMicroPad(4, 'P0.22'),
      proMicroPad(5, 'P0.24'),
      proMicroPad(6, 'P1.00'),
      proMicroPad(7, 'P0.11'),
      proMicroPad(8, 'P1.04'),
      proMicroPad(9, 'P1.06'),
    ],
    right: [
      power('RAW'),
      power('GND'),
      power('RST'),
      power('VCC'),
      proMicroPad(21, 'P0.31'),
      proMicroPad(20, 'P0.29'),
      proMicroPad(19, 'P0.02'),
      proMicroPad(18, 'P1.15'),
      proMicroPad(15, 'P1.13'),
      proMicroPad(14, 'P1.11'),
      proMicroPad(16, 'P0.10'),
      proMicroPad(10, 'P0.09'),
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
