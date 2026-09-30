import type { Interconnect } from './interconnects.ts';
import type { DisplayKind, KeyboardHardware, Side } from './types.ts';

/** The displays the wizard can generate. */
export const DISPLAYS: Record<DisplayKind, { label: string }> = {
  nice_view: { label: 'nice!view' },
  oled_128x32: { label: 'OLED 128×32 (0.91″)' },
  oled_128x64: { label: 'OLED 128×64 (0.96″)' },
};

export const DISPLAY_KINDS = Object.keys(DISPLAYS) as DisplayKind[];

/**
 * A display's pins (ZMK v0.3): the nice!view adapter uses D2 (MOSI), D3 (SCK)
 * and D1 (CS); an SSD1306 OLED sits on the controller's I2C pins (Pro Micro
 * D2/D3, Seeed XIAO D4/D5).
 */
export function displayPins(kind: DisplayKind, ic: Interconnect): { pin: number; use: string }[] {
  if (kind === 'nice_view') {
    return [
      { pin: 1, use: 'Display CS' },
      { pin: 2, use: 'Display data' },
      { pin: 3, use: 'Display clock' },
    ];
  }
  return [
    { pin: ic.i2cPins.sda, use: 'Display SDA' },
    { pin: ic.i2cPins.scl, use: 'Display SCL' },
  ];
}

/** The displays a controller footprint can take: a nice!view only where ZMK's adapter fits. */
export function availableDisplays(ic: Interconnect): DisplayKind[] {
  return DISPLAY_KINDS.filter((kind) => kind !== 'nice_view' || ic.niceViewAdapter);
}

export function halfDisplay(hw: KeyboardHardware, side?: Side): DisplayKind | undefined {
  return side === 'right' ? hw.displays?.right : hw.displays?.left;
}

export function hasDisplay(hw: KeyboardHardware): boolean {
  return halfDisplay(hw, 'left') !== undefined || (hw.split && halfDisplay(hw, 'right') !== undefined);
}

/** Sets (or with undefined, removes) a half's display; a one-piece keyboard uses the left slot. */
export function setDisplay(hw: KeyboardHardware, side: Side | undefined, kind: DisplayKind | undefined): KeyboardHardware {
  const both = { ...hw.displays, [side === 'right' ? 'right' : 'left']: kind };
  const displays = { ...(both.left ? { left: both.left } : {}), ...(both.right ? { right: both.right } : {}) };
  const next = { ...hw };
  if (displays.left || displays.right) next.displays = displays;
  else delete next.displays;
  return next;
}
