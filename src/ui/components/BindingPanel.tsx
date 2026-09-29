import type { Dispatch } from 'react';
import type { KeyClipboard } from '../../core/keymap/clipboard.ts';
import { describeBinding } from '../../core/keymap/display.ts';
import type { KeymapModel } from '../../core/keymap/model.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { BindingEditor } from './BindingEditor.tsx';
import { ClipboardButtons } from './SelectionPanel.tsx';
import { Section } from './ui/Section.tsx';

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
  const label = describeBinding(binding, keymap);
  return (
    <div className="binding-panel">
      <Section
        variant="flat"
        title={`Key ${keyIndex} · ${layerName}`}
        lead={
          <kbd className={`mini-key panel-key kind-${label.kind}`} aria-hidden="true">
            {label.main}
          </kbd>
        }
      >
        <BindingEditor
          binding={binding}
          keymap={keymap}
          context="key"
          shortcuts
          onChange={(next) => dispatch({ type: 'setBinding', binding: next })}
        />
      </Section>
      <ClipboardButtons keymap={keymap} clipboard={clipboard} dispatch={dispatch} />
    </div>
  );
}
