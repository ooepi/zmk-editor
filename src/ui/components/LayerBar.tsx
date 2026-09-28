import { useEffect, useRef, useState, type Dispatch, type DragEvent, type KeyboardEvent } from 'react';
import type { Layer } from '../../core/keymap/model.ts';
import { dragKind } from '../dnd.ts';
import { useReorder } from '../reorder.ts';
import type { EditorAction } from '../state/editorReducer.ts';

interface LayerBarProps {
  layers: Layer[];
  active: number;
  dispatch: Dispatch<EditorAction>;
}

const layerName = (layer: Layer) => layer.displayName ?? layer.name;

/** How long a drag has to rest on a layer tab before switching to that layer. */
export const HOVER_SWITCH_MS = 500;

export function LayerBar({ layers, active, dispatch }: LayerBarProps) {
  const [renaming, setRenaming] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [hovered, setHovered] = useState<number | null>(null);
  const reorder = useReorder('layers', (from, to) => dispatch({ type: 'moveLayer', from, to }));
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const stopHover = () => {
    clearTimeout(hoverTimer.current);
    setHovered(null);
  };
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  // Dragging a key or a palette tile over a tab switches to that layer after a moment.
  const onTabDragEnter = (event: DragEvent, index: number) => {
    if (!dragKind(event.dataTransfer) || index === active || hovered === index) return;
    clearTimeout(hoverTimer.current);
    setHovered(index);
    hoverTimer.current = setTimeout(() => {
      setHovered(null);
      dispatch({ type: 'selectLayer', index });
    }, HOVER_SWITCH_MS);
  };

  const startRename = (index: number) => {
    const layer = layers[index];
    if (!layer) return;
    setDraft(layerName(layer));
    setRenaming(index);
  };

  const finishRename = () => {
    const name = draft.trim();
    const layer = renaming === null ? undefined : layers[renaming];
    if (renaming !== null && layer && name && name !== layerName(layer)) {
      dispatch({ type: 'renameLayer', index: renaming, name });
    }
    setRenaming(null);
  };

  const onRenameKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') finishRename();
    else if (event.key === 'Escape') setRenaming(null);
  };

  const addLayer = () => {
    const name = `Layer ${layers.length}`;
    dispatch({ type: 'addLayer', name });
    setDraft(name);
    setRenaming(layers.length);
  };

  const deleteActive = () => {
    const layer = layers[active];
    if (!layer || layers.length <= 1) return;
    if (window.confirm(`Delete layer "${layerName(layer)}"? Keys that switch to it will do nothing.`)) {
      dispatch({ type: 'deleteLayer', index: active });
    }
  };

  return (
    <div className="layerbar">
      <div className="layer-tabs" role="tablist" aria-label="Layers">
        {layers.map((layer, index) =>
          renaming === index ? (
            <input
              key={layer.name}
              className="layer-rename"
              aria-label="Layer name"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={finishRename}
              onKeyDown={onRenameKey}
            />
          ) : (
            <button
              key={layer.name}
              type="button"
              role="tab"
              aria-selected={index === active}
              className={`layer-tab${index === active ? ' active' : ''}${hovered === index ? ' drag-hover' : ''}${reorder.dropClass(index)}`}
              onClick={() => dispatch({ type: 'selectLayer', index })}
              {...reorder.handle(index)}
              {...reorder.target(index, 'x')}
              onDragEnter={(event) => onTabDragEnter(event, index)}
              onDragLeave={(event) => {
                reorder.target(index, 'x').onDragLeave(event);
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) stopHover();
              }}
              onDrop={(event) => {
                reorder.target(index, 'x').onDrop(event);
                stopHover();
              }}
              onDoubleClick={() => startRename(index)}
              title="Double-click to rename, drag to reorder"
            >
              <span className="layer-index">{index}</span>
              {layerName(layer)}
            </button>
          ),
        )}
      </div>
      <div className="layer-actions">
        <button type="button" className="icon-button" onClick={addLayer} aria-label="Add layer" title="Add layer">
          +
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => startRename(active)}
          aria-label="Rename layer"
          title="Rename layer"
        >
          ✎
        </button>
        <button
          type="button"
          className="icon-button"
          disabled={active === 0}
          onClick={() => dispatch({ type: 'moveLayer', from: active, to: active - 1 })}
          aria-label="Move layer left"
          title="Move layer left"
        >
          ←
        </button>
        <button
          type="button"
          className="icon-button"
          disabled={active === layers.length - 1}
          onClick={() => dispatch({ type: 'moveLayer', from: active, to: active + 1 })}
          aria-label="Move layer right"
          title="Move layer right"
        >
          →
        </button>
        <button
          type="button"
          className="icon-button danger"
          disabled={layers.length <= 1}
          onClick={deleteActive}
          aria-label="Delete layer"
          title="Delete layer"
        >
          🗑
        </button>
      </div>
    </div>
  );
}
