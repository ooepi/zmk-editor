import { CONTROLLER_DATA, type ControllerData } from '../catalog/keyboards.data.ts';

/** A pad on the Pro Micro header; `pin` is the `&pro_micro` number, null for power pads. */
export interface HeaderPad {
  pin: number | null;
  label: string;
  /** The nRF52840 pin behind it on a nice!nano (ZMK's arduino_pro_micro_pins.dtsi). */
  niceNano?: string;
}

const pad = (pin: number, niceNano: string): HeaderPad => ({ pin, label: `D${pin}`, niceNano });
const power = (label: string): HeaderPad => ({ pin: null, label });

/** The header seen from above with USB at the top: each side's pads, top to bottom. */
export const PRO_MICRO_HEADER: { left: HeaderPad[]; right: HeaderPad[] } = {
  left: [
    pad(1, 'P0.06'), pad(0, 'P0.08'), power('GND'), power('GND'), pad(2, 'P0.17'), pad(3, 'P0.20'),
    pad(4, 'P0.22'), pad(5, 'P0.24'), pad(6, 'P1.00'), pad(7, 'P0.11'), pad(8, 'P1.04'), pad(9, 'P1.06'),
  ],
  right: [
    power('RAW'), power('GND'), power('RST'), power('VCC'), pad(21, 'P0.31'), pad(20, 'P0.29'),
    pad(19, 'P0.02'), pad(18, 'P1.15'), pad(15, 'P1.13'), pad(14, 'P1.11'), pad(16, 'P0.10'), pad(10, 'P0.09'),
  ],
};

/** Every `&pro_micro` pin; the same on every nRF52840 Pro Micro board in ZMK v0.3. */
export const PRO_MICRO_PINS: number[] = [...PRO_MICRO_HEADER.left, ...PRO_MICRO_HEADER.right]
  .flatMap((p) => (p.pin === null ? [] : [p.pin]))
  .sort((a, b) => a - b);

export const pinLabel = (pin: number) => `D${pin}`;

/** Wireless nRF52840 controllers with the Pro Micro footprint. */
export const HARDWARE_CONTROLLERS: ControllerData[] = CONTROLLER_DATA.filter(
  (c) => c.ble && c.exposes.includes('pro_micro') && !c.id.endsWith('_52833'),
);

export const isNiceNano = (controller: string) => controller === 'nice_nano' || controller === 'nice_nano_v2';
