import type { PaletteItem } from '../core/keymap/palette.ts';

/** Drag data types: a palette tile (JSON `PaletteItem`) or a key on the keyboard (its index). */
const PALETTE_TYPE = 'application/x-zmk-palette';
const KEY_TYPE = 'application/x-zmk-key';

export function setPaletteDrag(data: DataTransfer, item: PaletteItem): void {
  data.setData(PALETTE_TYPE, JSON.stringify(item));
  data.effectAllowed = 'copy';
}

/** A key on a given layer, as carried by a key drag. */
export interface KeyRef {
  layer: number;
  index: number;
}

export function setKeyDrag(data: DataTransfer, key: KeyRef): void {
  data.setData(KEY_TYPE, JSON.stringify(key));
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

export function readKeyDrag(data: DataTransfer): KeyRef | undefined {
  const text = data.getData(KEY_TYPE);
  if (!text) return undefined;
  try {
    const key = JSON.parse(text) as Partial<KeyRef>;
    return Number.isInteger(key.layer) && Number.isInteger(key.index) ? (key as KeyRef) : undefined;
  } catch {
    return undefined;
  }
}
