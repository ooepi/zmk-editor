import type { Dispatch } from 'react';
import type { KeymapModel } from '../../core/keymap/model.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { BindingEditor } from './BindingEditor.tsx';

interface EncoderPanelProps {
  keymap: KeymapModel;
  layer: number;
  sensor: number;
  dispatch: Dispatch<EditorAction>;
}

export function EncoderPanel({ keymap, layer, sensor, dispatch }: EncoderPanelProps) {
  const binding = keymap.layers[layer]?.sensorBindings?.[sensor] ?? { behavior: 'trans', params: [] };
  const layerName = keymap.layers[layer]?.displayName ?? keymap.layers[layer]?.name;
  return (
    <div className="binding-panel">
      <h2 className="panel-title">
        Encoder {sensor + 1} · {layerName}
      </h2>
      <BindingEditor
        binding={binding}
        keymap={keymap}
        context="sensor"
        shortcuts
        onChange={(next) => dispatch({ type: 'setSensorBinding', binding: next })}
      />
      <p className="muted small">
        For scrolling or other bindings per direction, create an encoder behavior in the Behaviors tab and pick it here.
      </p>
    </div>
  );
}
