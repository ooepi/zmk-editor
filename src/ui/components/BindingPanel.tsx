import type { Dispatch } from 'react';
import type { KeyClipboard } from '../../core/keymap/clipboard.ts';
import type { KeymapModel } from '../../core/keymap/model.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { BindingEditor } from './BindingEditor.tsx';
import { ClipboardButtons } from './SelectionPanel.tsx';

interface BindingPanelProps {
  keymap: KeymapModel;
  layer: number;
  keyIndex: number;
  clipboard: KeyClipboard | null;
  dispatch: Dispatch<EditorAction>;
}

export function BindingPanel({ keymap, layer, keyIndex, clipboard, dispatch }: BindingPanelProps) {
  const binding = keymap.layers[layer]?.bindings[keyIndex];
  if (!binding) return null;
  const layerName = keymap.layers[layer]?.displayName ?? keymap.layers[layer]?.name;
  return (
    <div className="binding-panel">
      <h2 className="panel-title">
        Key {keyIndex} · {layerName}
      </h2>
      <BindingEditor
        binding={binding}
        keymap={keymap}
        context="key"
        shortcuts
        onChange={(next) => dispatch({ type: 'setBinding', binding: next })}
      />
      <ClipboardButtons keymap={keymap} clipboard={clipboard} dispatch={dispatch} />
    </div>
  );
}
