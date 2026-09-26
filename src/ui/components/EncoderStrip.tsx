import { useMemo } from 'react';
import { describeSensorBinding, displayContext } from '../../core/keymap/display.ts';
import type { KeymapModel } from '../../core/keymap/model.ts';
import { sensorCount } from '../../core/keymap/sensorEdit.ts';

interface EncoderStripProps {
  keymap: KeymapModel;
  layer: number;
  selected: number | null;
  onSelect: (index: number) => void;
}

/** One knob per encoder, showing what it does each way on the current layer. */
export function EncoderStrip({ keymap, layer, selected, onSelect }: EncoderStripProps) {
  const labels = useMemo(() => {
    const ctx = displayContext(keymap);
    return Array.from({ length: sensorCount(keymap) }, (_, i) =>
      describeSensorBinding(keymap.layers[layer]?.sensorBindings?.[i] ?? { behavior: 'trans', params: [] }, ctx),
    );
  }, [keymap, layer]);
  if (labels.length === 0) return null;

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
          <span className="encoder-dir">↺ {label.ccw}</span>
          <span className="encoder-knob" aria-hidden="true" />
          <span className="encoder-dir">{label.cw} ↻</span>
          {label.name && <span className="encoder-name">&amp;{label.name}</span>}
        </button>
      ))}
    </div>
  );
}
