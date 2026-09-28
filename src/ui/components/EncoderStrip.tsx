import { useMemo, useState, type DragEvent } from 'react';
import { describeSensorBinding, displayContext } from '../../core/keymap/display.ts';
import type { KeymapModel } from '../../core/keymap/model.ts';
import type { EncoderDirection, PaletteItem } from '../../core/keymap/palette.ts';
import { sensorCount } from '../../core/keymap/sensorEdit.ts';
import { dragKind, readPaletteDrag } from '../dnd.ts';

interface EncoderStripProps {
  keymap: KeymapModel;
  layer: number;
  selected: number | null;
  onSelect: (index: number) => void;
  /** Enables dropping palette tiles on either direction of an encoder. */
  onDropItem?: ((index: number, direction: EncoderDirection, item: PaletteItem) => void) | undefined;
}

/** One knob per encoder, showing what it does each way on the current layer. */
export function EncoderStrip({ keymap, layer, selected, onSelect, onDropItem }: EncoderStripProps) {
  const [over, setOver] = useState<string | null>(null);
  const labels = useMemo(() => {
    const ctx = displayContext(keymap);
    return Array.from({ length: sensorCount(keymap) }, (_, i) =>
      describeSensorBinding(keymap.layers[layer]?.sensorBindings?.[i] ?? { behavior: 'trans', params: [] }, ctx),
    );
  }, [keymap, layer]);
  if (labels.length === 0) return null;

  /** Drop handlers for one direction of one encoder; only palette tiles are accepted. */
  const dropZone = (index: number, direction: EncoderDirection) => {
    if (!onDropItem) return {};
    const id = `${index}-${direction}`;
    return {
      onDragOver: (event: DragEvent) => {
        if (dragKind(event.dataTransfer) !== 'palette') return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setOver(id);
      },
      onDragLeave: () => setOver(null),
      onDrop: (event: DragEvent) => {
        setOver(null);
        const item = readPaletteDrag(event.dataTransfer);
        if (!item) return;
        event.preventDefault();
        onDropItem(index, direction, item);
      },
    };
  };
  const zoneClass = (index: number, direction: EncoderDirection) =>
    `encoder-dir${over === `${index}-${direction}` ? ' drop-target' : ''}`;

  return (
    <div className="encoders" role="group" aria-label="Encoders">
      {labels.map((label, index) => (
        <button
          key={index}
          type="button"
          className={`encoder${selected === index ? ' selected' : ''}`}
          aria-pressed={selected === index}
          aria-label={`Encoder ${index + 1}: ${label.ccw} / ${label.cw}`}
          onClick={() => onSelect(index)}
        >
          <span className={zoneClass(index, 'ccw')} {...dropZone(index, 'ccw')}>
            ↺ {label.ccw}
          </span>
          <span className="encoder-knob" aria-hidden="true" />
          <span className={zoneClass(index, 'cw')} {...dropZone(index, 'cw')}>
            {label.cw} ↻
          </span>
          {label.name && <span className="encoder-name">&amp;{label.name}</span>}
        </button>
      ))}
    </div>
  );
}
