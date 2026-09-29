import type { Dispatch } from 'react';
import type { KeyClipboard } from '../../core/keymap/clipboard.ts';
import type { KeymapModel } from '../../core/keymap/model.ts';
import type { PaletteItem } from '../../core/keymap/palette.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { Icon } from './Icon.tsx';
import { Section } from './ui/Section.tsx';

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
          <Icon name="copy" size={15} />
          Copy
        </button>
        <button type="button" className="button" title="Cut (Ctrl+X)" onClick={() => dispatch({ type: 'cutKeys' })}>
          <Icon name="scissors" size={15} />
          Cut
        </button>
        <button
          type="button"
          className="button"
          title="Paste (Ctrl+V)"
          disabled={!clipboard}
          onClick={() => dispatch({ type: 'pasteKeys' })}
        >
          <Icon name="clipboard" size={15} />
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
      <Section
        variant="flat"
        title={`${selection.length} keys selected · ${layerName}`}
        lead={
          <span className="mini-key panel-key panel-count" aria-hidden="true">
            {selection.length}
          </span>
        }
        description="Click a palette tile to put it on all of them. Ctrl+click a key to add or remove it; Esc clears the selection."
      >
        <div className="row">
          <button type="button" className="button" onClick={() => dispatch({ type: 'placeOnSelection', item: TRANSPARENT })}>
            <span aria-hidden="true">▽</span>
            Transparent
          </button>
          <button type="button" className="button" onClick={() => dispatch({ type: 'placeOnSelection', item: NONE })}>
            <span aria-hidden="true">✕</span>
            None
          </button>
        </div>
      </Section>
      <ClipboardButtons keymap={keymap} clipboard={clipboard} dispatch={dispatch} />
    </div>
  );
}
