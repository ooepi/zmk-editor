import { useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import { describeSensorBinding, displayContext } from '../../core/keymap/display.ts';
import type { KeymapModel } from '../../core/keymap/model.ts';
import type { EncoderDirection, PaletteItem } from '../../core/keymap/palette.ts';
import type { EncoderSpot } from '../../core/layouts/types.ts';
import { dragKind, readPaletteDrag } from '../dnd.ts';

export interface EncoderControls {
  selected: number | null;
  onSelect: (index: number) => void;
  /** Enables dropping palette tiles on either half (direction) of a knob. */
  onDropItem?: ((index: number, direction: EncoderDirection, item: PaletteItem) => void) | undefined;
}

interface EncoderKnobsProps extends EncoderControls {
  keymap: KeymapModel;
  layer: number;
  spots: EncoderSpot[];
  /** Turns a spot (layout units) into a position on the keyboard, in % of its size. */
  place: (spot: EncoderSpot) => CSSProperties;
}

/**
 * Encoders as round knobs on the keyboard, each at its spot: ↺ on the left half, ↻ on the right,
 * showing what each way does on the current layer.
 */
export function EncoderKnobs({ keymap, layer, spots, place, selected, onSelect, onDropItem }: EncoderKnobsProps) {
  const [over, setOver] = useState<string | null>(null);
  const labels = useMemo(() => {
    const ctx = displayContext(keymap);
    return spots.map((_, i) => describeSensorBinding(keymap.layers[layer]?.sensorBindings?.[i] ?? { behavior: 'trans', params: [] }, ctx));
  }, [keymap, layer, spots]);
  if (spots.length === 0) return null;

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
  const half = (index: number, direction: EncoderDirection) => `key-knob-half ${direction}${over === `${index}-${direction}` ? ' drop-target' : ''}`;

  return (
    <div className="key-knobs" role="group" aria-label="Encoders">
      {spots.map((spot, index) => {
        const label = labels[index] ?? { ccw: '', cw: '' };
        return (
          <button
            key={index}
            type="button"
            className={`key-knob${selected === index ? ' selected' : ''}`}
            style={place(spot)}
            aria-pressed={selected === index}
            aria-label={`Encoder ${index + 1}: ${label.ccw} / ${label.cw}`}
            title={label.name ? `Encoder ${index + 1} · &${label.name}` : `Encoder ${index + 1}`}
            onClick={() => onSelect(index)}
          >
            <span className={half(index, 'ccw')} {...dropZone(index, 'ccw')}>
              <span className="key-knob-arrow">↺</span> {label.ccw}
            </span>
            <span className={half(index, 'cw')} {...dropZone(index, 'cw')}>
              {label.cw} <span className="key-knob-arrow">↻</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
