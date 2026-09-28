import { useState, type CSSProperties, type DragEvent } from 'react';
import type { KeycapLabel } from '../../core/keymap/display.ts';
import type { PaletteItem } from '../../core/keymap/palette.ts';
import { dragKind, readKeyDrag, readPaletteDrag, setKeyDrag, type KeyRef } from '../dnd.ts';

/** Drop handlers; when given, the key can be dragged and accepts palette tiles and other keys. */
export interface KeyDropHandlers {
  /** The layer shown; recorded in key drags so a drop on another layer can copy from it. */
  layer: number;
  onDropItem: (index: number, item: PaletteItem) => void;
  /** `copy` when Alt or Ctrl was held. */
  onDropKey: (from: KeyRef, to: number, copy: boolean) => void;
}

interface KeycapProps {
  index: number;
  label: KeycapLabel;
  selected: boolean;
  highlighted?: boolean;
  style: CSSProperties;
  /** `additive` for Ctrl/Shift-clicks, which add to the selection. */
  onSelect: (index: number, additive: boolean) => void;
  drop?: KeyDropHandlers | undefined;
}

function sizeClass(text: string): string {
  const length = [...text].length;
  if (length <= 2) return 'size-l';
  if (length <= 5) return 'size-m';
  if (length <= 9) return 'size-s';
  return 'size-xs';
}

export function Keycap({ index, label, selected, highlighted = false, style, onSelect, drop }: KeycapProps) {
  const [over, setOver] = useState(false);
  const description = label.sub ? `${label.main} (${label.sub})` : label.main;

  const onDragOver = (event: DragEvent) => {
    const kind = dragKind(event.dataTransfer);
    if (!kind) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = kind === 'key' && !(event.altKey || event.ctrlKey) ? 'move' : 'copy';
    setOver(true);
  };

  const onDrop = (event: DragEvent) => {
    setOver(false);
    if (!drop) return;
    const item = readPaletteDrag(event.dataTransfer);
    const from = item ? undefined : readKeyDrag(event.dataTransfer);
    if (!item && from === undefined) return;
    event.preventDefault();
    if (item) drop.onDropItem(index, item);
    else if (from !== undefined) drop.onDropKey(from, index, event.altKey || event.ctrlKey);
  };

  const dragProps = drop
    ? {
        draggable: true,
        onDragStart: (event: DragEvent) => setKeyDrag(event.dataTransfer, { layer: drop.layer, index }),
        onDragOver,
        onDragLeave: () => setOver(false),
        onDrop,
      }
    : {};

  return (
    <button
      type="button"
      className={`keycap kind-${label.kind}${selected ? ' selected' : ''}${highlighted ? ' highlighted' : ''}${over ? ' drop-target' : ''}`}
      style={style}
      aria-label={`Key ${index}: ${description}`}
      aria-pressed={selected}
      title={description}
      onClick={(event) => onSelect(index, event.ctrlKey || event.metaKey || event.shiftKey)}
      {...dragProps}
    >
      <span className={`keycap-main ${sizeClass(label.main)}`}>{label.main}</span>
      {label.sub && <span className="keycap-sub">{label.sub}</span>}
    </button>
  );
}
