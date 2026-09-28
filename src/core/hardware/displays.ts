import type { DisplayKind, KeyboardHardware, Side } from './types.ts';

/**
 * The displays the wizard offers, on their standard pins (ZMK v0.3): the
 * nice!view adapter uses D2 (MOSI), D3 (SCK) and D1 (CS); an SSD1306 OLED sits
 * on the Pro Micro's I2C pins, D2 (SDA) and D3 (SCL).
 */
export const DISPLAYS: Record<DisplayKind, { label: string; pins: { pin: number; use: string }[] }> = {
  nice_view: {
    label: 'nice!view',
    pins: [
      { pin: 1, use: 'Display CS' },
      { pin: 2, use: 'Display data' },
      { pin: 3, use: 'Display clock' },
    ],
  },
  oled_128x32: { label: 'OLED 128×32 (0.91″)', pins: [{ pin: 2, use: 'Display SDA' }, { pin: 3, use: 'Display SCL' }] },
  oled_128x64: { label: 'OLED 128×64 (0.96″)', pins: [{ pin: 2, use: 'Display SDA' }, { pin: 3, use: 'Display SCL' }] },
};

export const DISPLAY_KINDS = Object.keys(DISPLAYS) as DisplayKind[];

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
