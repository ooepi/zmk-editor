import type { PaletteItem } from '../core/keymap/palette.ts';

/** Drag data types: a palette tile (JSON `PaletteItem`) or a key on the keyboard (its index). */
const PALETTE_TYPE = 'application/x-zmk-palette';
const KEY_TYPE = 'application/x-zmk-key';

export function setPaletteDrag(data: DataTransfer, item: PaletteItem): void {
  data.setData(PALETTE_TYPE, JSON.stringify(item));
  data.effectAllowed = 'copy';
}

export function setKeyDrag(data: DataTransfer, index: number): void {
  data.setData(KEY_TYPE, String(index));
  data.effectAllowed = 'copyMove';
}

/** Whether a drag carries something a key accepts. Only the types are readable before the drop. */
export function dragKind(data: DataTransfer): 'palette' | 'key' | null {
  const types = Array.from(data.types);
  if (types.includes(PALETTE_TYPE)) return 'palette';
  if (types.includes(KEY_TYPE)) return 'key';
  return null;
}

export function readPaletteDrag(data: DataTransfer): PaletteItem | undefined {
  const text = data.getData(PALETTE_TYPE);
  if (!text) return undefined;
  try {
    const item = JSON.parse(text) as PaletteItem;
    return item.kind === 'keycode' || item.kind === 'binding' ? item : undefined;
  } catch {
    return undefined;
  }
}

export function readKeyDrag(data: DataTransfer): number | undefined {
  const text = data.getData(KEY_TYPE);
  const index = text === '' ? NaN : Number(text);
  return Number.isInteger(index) ? index : undefined;
}
