import type { EncoderSpot, PhysicalKey, PhysicalLayout } from '../layouts/types.ts';

/** A pad's D-number on the controller (`&pro_micro 4`, `&xiao_d 4`), or null while none is picked yet. */
export type Pin = number | null;
export type Side = 'left' | 'right';
export type DiodeDirection = 'col2row' | 'row2col';

/** A key: where it's drawn, and the matrix position (or direct input) it's wired to. */
export interface HardwareKey extends PhysicalKey {
  /** Matrix row; always 0 for direct wiring. */
  row: number;
  /** Matrix column, or for direct wiring the index into the half's input pins. */
  col: number;
  /** The half it's on; split keyboards only. */
  side?: Side;
}

export interface MatrixPins {
  rows: Pin[];
  cols: Pin[];
}

export interface MatrixWiring {
  kind: 'matrix';
  diodeDirection: DiodeDirection;
  rows: Pin[];
  cols: Pin[];
  /** The right half's own pins; without it the right half mirrors the left. */
  right?: MatrixPins;
}

export interface DirectWiring {
  kind: 'direct';
  pins: Pin[];
  /** The right half's own pins; without it both halves use `pins`. */
  right?: Pin[];
}

export type Wiring = MatrixWiring | DirectWiring;

/** An EC11 rotary encoder's two signal pins; its push button is an ordinary key in the matrix. */
export interface Encoder {
  a: Pin;
  b: Pin;
}

/** A screen on one half: a nice!view (via ZMK's adapter) or an SSD1306 OLED on the controller's I2C pins. */
export type DisplayKind = 'nice_view' | 'oled_128x32' | 'oled_128x64';

/** A display's wires: a nice!view's SPI CS, data (MOSI) and clock (SCK), or an OLED's I2C SDA and SCL. */
export type DisplaySignal = 'cs' | 'data' | 'clock' | 'sda' | 'scl';

/** A half's display pins that differ from the defaults. */
export type DisplayPinOverrides = Partial<Record<DisplaySignal, Pin>>;

/** A keyboard designed in the editor; its ZMK shield is generated from this. */
export interface KeyboardHardware {
  /** Shield id: lowercase letters, digits and `_`, e.g. `my_split`. */
  name: string;
  /** Shown in the editor and used as the Bluetooth name (at most 16 characters). */
  displayName: string;
  /** ZMK board id of the controller, e.g. `nice_nano_v2`. */
  controller: string;
  split: boolean;
  wiring: Wiring;
  /** In keymap order. */
  keys: HardwareKey[];
  /** Encoders on the left half (or the only half). */
  encoders?: Encoder[];
  /** The right half's own encoders; without it the right half mirrors the left's, with A and B swapped. */
  rightEncoders?: Encoder[];
  /** A display per half; a one-piece keyboard uses `left`. */
  displays?: { left?: DisplayKind; right?: DisplayKind };
  /** Display pins moved off their defaults, per half; a one-piece keyboard uses `left`. */
  displayPins?: { left?: DisplayPinOverrides; right?: DisplayPinOverrides };
  /** Where each encoder's knob is drawn, in `sensorOrder`; null for the default spot under its half. */
  encoderSpots?: (EncoderSpot | null)[];
}

/** The keys' positions as a physical layout. */
export function hardwareLayout(hw: KeyboardHardware): PhysicalLayout {
  const keys = hw.keys.map(({ x, y, w, h, r, rx, ry }) => ({ x, y, w, h, r, rx, ry }));
  return hw.encoderSpots?.some(Boolean) ? { name: hw.displayName, keys, encoders: hw.encoderSpots } : { name: hw.displayName, keys };
}
