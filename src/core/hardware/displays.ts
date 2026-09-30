import { interconnectOf, type Interconnect } from './interconnects.ts';
import type { DisplayKind, DisplayPinOverrides, DisplaySignal, KeyboardHardware, Pin, Side } from './types.ts';

/** The displays the wizard can generate. */
export const DISPLAYS: Record<DisplayKind, { label: string }> = {
  nice_view: { label: 'nice!view' },
  oled_128x32: { label: 'OLED 128×32 (0.91″)' },
  oled_128x64: { label: 'OLED 128×64 (0.96″)' },
};

export const DISPLAY_KINDS = Object.keys(DISPLAYS) as DisplayKind[];

export interface DisplayPin {
  signal: DisplaySignal;
  pin: Pin;
  /** What the pin is used for, e.g. "Display CS". */
  use: string;
}

export const SIGNAL_USES: Record<DisplaySignal, string> = {
  cs: 'Display CS',
  data: 'Display data',
  clock: 'Display clock',
  sda: 'Display SDA',
  scl: 'Display SCL',
};

/** Signals in the order they're listed and written. */
export const DISPLAY_SIGNALS = Object.keys(SIGNAL_USES) as DisplaySignal[];

/**
 * A display's default pins (ZMK v0.3): a nice!view on the adapter's D1 (CS),
 * D2 (MOSI) and D3 (SCK), or on a XIAO its SPI pads; an SSD1306 OLED on the
 * controller's I2C pins (Pro Micro D2/D3, Seeed XIAO D4/D5).
 */
export function defaultDisplayPins(kind: DisplayKind, ic: Interconnect): DisplayPin[] {
  const pins: [DisplaySignal, number][] =
    kind === 'nice_view'
      ? [
          ['cs', ic.niceViewPins.cs],
          ['data', ic.niceViewPins.data],
          ['clock', ic.niceViewPins.clock],
        ]
      : [
          ['sda', ic.i2cPins.sda],
          ['scl', ic.i2cPins.scl],
        ];
  return pins.map(([signal, pin]) => ({ signal, pin, use: SIGNAL_USES[signal] }));
}

/** A display's pins: the defaults, with a half's overrides applied. */
export function displayPins(kind: DisplayKind, ic: Interconnect, overrides?: DisplayPinOverrides): DisplayPin[] {
  return defaultDisplayPins(kind, ic).map((p) => (overrides && p.signal in overrides ? { ...p, pin: overrides[p.signal] ?? null } : p));
}

const sideKey = (side?: Side) => (side === 'right' ? 'right' : 'left');

/** A half's display pins; none without a display. */
export function halfDisplayPins(hw: KeyboardHardware, side?: Side): DisplayPin[] {
  const kind = halfDisplay(hw, side);
  return kind ? displayPins(kind, interconnectOf(hw.controller), hw.displayPins?.[sideKey(side)]) : [];
}

/** The same hardware with a half's overrides replaced; empty ones are left out so files stay unchanged. */
function withOverrides(hw: KeyboardHardware, side: Side | undefined, overrides: DisplayPinOverrides): KeyboardHardware {
  const all = { ...hw.displayPins, [sideKey(side)]: overrides };
  const kept = Object.fromEntries(Object.entries(all).filter(([, o]) => o && Object.keys(o).length > 0));
  const next = { ...hw };
  if (Object.keys(kept).length > 0) next.displayPins = kept;
  else delete next.displayPins;
  return next;
}

/** Sets one display pin; the default pin removes the override. */
export function setDisplayPin(hw: KeyboardHardware, side: Side | undefined, signal: DisplaySignal, pin: Pin): KeyboardHardware {
  const kind = halfDisplay(hw, side);
  // A signal the half's display doesn't have (e.g. a field armed before the display changed) is ignored.
  const fallback = kind ? defaultDisplayPins(kind, interconnectOf(hw.controller)).find((p) => p.signal === signal) : undefined;
  if (!fallback) return hw;
  const others = Object.entries(hw.displayPins?.[sideKey(side)] ?? {}).filter(([s]) => s !== signal);
  const overrides: DisplayPinOverrides = Object.fromEntries(pin === fallback.pin ? others : [...others, [signal, pin]]);
  return withOverrides(hw, side, overrides);
}

/** Puts a half's display back on its default pins. */
export function clearDisplayPins(hw: KeyboardHardware, side: Side | undefined): KeyboardHardware {
  return withOverrides(hw, side, {});
}

/** Whether a half's nice!view goes through ZMK's adapter: a Pro Micro, on the adapter's own pins. */
export function usesNiceViewAdapter(hw: KeyboardHardware, side?: Side): boolean {
  const ic = interconnectOf(hw.controller);
  if (halfDisplay(hw, side) !== 'nice_view' || !ic.niceViewAdapter) return false;
  const pins = halfDisplayPins(hw, side);
  return defaultDisplayPins('nice_view', ic).every((d, i) => pins[i]?.pin === d.pin);
}

export function halfDisplay(hw: KeyboardHardware, side?: Side): DisplayKind | undefined {
  return side === 'right' ? hw.displays?.right : hw.displays?.left;
}

export function hasDisplay(hw: KeyboardHardware): boolean {
  return halfDisplay(hw, 'left') !== undefined || (hw.split && halfDisplay(hw, 'right') !== undefined);
}

/** Sets (or with undefined, removes) a half's display, dropping its pin overrides; a one-piece keyboard uses the left slot. */
export function setDisplay(hw: KeyboardHardware, side: Side | undefined, kind: DisplayKind | undefined): KeyboardHardware {
  const both = { ...hw.displays, [sideKey(side)]: kind };
  const displays = { ...(both.left ? { left: both.left } : {}), ...(both.right ? { right: both.right } : {}) };
  const next = halfDisplay(hw, side) === kind ? { ...hw } : clearDisplayPins(hw, side);
  if (displays.left || displays.right) next.displays = displays;
  else delete next.displays;
  return next;
}
