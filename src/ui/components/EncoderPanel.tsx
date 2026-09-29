import type { Dispatch } from 'react';
import type { KeymapModel } from '../../core/keymap/model.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { BindingEditor } from './BindingEditor.tsx';
import { Section } from './ui/Section.tsx';

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
      <Section
        variant="flat"
        title={`Encoder ${sensor + 1} · ${layerName}`}
        lead={<span className="knob small panel-knob" aria-hidden="true" />}
        description="For scrolling or other bindings per direction, create an encoder behavior in the Behaviors tab and pick it here."
      >
        <BindingEditor
          binding={binding}
          keymap={keymap}
          context="sensor"
          shortcuts
          onChange={(next) => dispatch({ type: 'setSensorBinding', binding: next })}
        />
      </Section>
    </div>
  );
}
