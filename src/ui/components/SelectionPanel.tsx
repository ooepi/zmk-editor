import type { Dispatch } from 'react';
import type { KeyClipboard } from '../../core/keymap/clipboard.ts';
import type { KeymapModel } from '../../core/keymap/model.ts';
import type { PaletteItem } from '../../core/keymap/palette.ts';
import type { EditorAction } from '../state/editorReducer.ts';

interface ClipboardButtonsProps {
  keymap: KeymapModel;
  clipboard: KeyClipboard | null;
  dispatch: Dispatch<EditorAction>;
}

/** Copy / Cut / Paste for the selected keys, and what the clipboard holds. */
export function ClipboardButtons({ keymap, clipboard, dispatch }: ClipboardButtonsProps) {
  const count = clipboard?.keys.length ?? 0;
  const from = clipboard ? (keymap.layers[clipboard.layer]?.displayName ?? keymap.layers[clipboard.layer]?.name) : undefined;
  return (
    <div className="clipboard">
      <div className="row">
        <button type="button" className="button" title="Copy (Ctrl+C)" onClick={() => dispatch({ type: 'copyKeys' })}>
          Copy
        </button>
        <button type="button" className="button" title="Cut (Ctrl+X)" onClick={() => dispatch({ type: 'cutKeys' })}>
          Cut
        </button>
        <button
          type="button"
          className="button"
          title="Paste (Ctrl+V)"
          disabled={!clipboard}
          onClick={() => dispatch({ type: 'pasteKeys' })}
        >
          Paste
        </button>
      </div>
      {clipboard && (
        <p className="muted small">
          Clipboard: {count === 1 ? '1 key' : `${count} keys`}
          {from ? ` from ${from}` : ''}.{' '}
          {count === 1 ? 'Paste puts it on every selected key.' : 'Paste puts them in the same positions on this layer.'}
        </p>
      )}
    </div>
  );
}

interface SelectionPanelProps extends ClipboardButtonsProps {
  layer: number;
  selection: number[];
}

const TRANSPARENT: PaletteItem = { kind: 'binding', binding: { behavior: 'trans', params: [] } };
const NONE: PaletteItem = { kind: 'binding', binding: { behavior: 'none', params: [] } };

/** The side panel while several keys are selected. */
export function SelectionPanel({ keymap, layer, selection, clipboard, dispatch }: SelectionPanelProps) {
  const layerName = keymap.layers[layer]?.displayName ?? keymap.layers[layer]?.name;
  return (
    <div className="binding-panel">
      <h2 className="panel-title">
        {selection.length} keys selected · {layerName}
      </h2>
      <p className="muted small">
        Click a palette tile to put it on all of them. Ctrl+click a key to add or remove it; Esc clears the selection.
      </p>
      <div className="row">
        <button type="button" className="button" onClick={() => dispatch({ type: 'placeOnSelection', item: TRANSPARENT })}>
          Transparent
        </button>
        <button type="button" className="button" onClick={() => dispatch({ type: 'placeOnSelection', item: NONE })}>
          None
        </button>
      </div>
      <ClipboardButtons keymap={keymap} clipboard={clipboard} dispatch={dispatch} />
    </div>
  );
}
