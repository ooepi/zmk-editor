import { useEffect, useRef, useState, type Dispatch, type DragEvent, type KeyboardEvent } from 'react';
import type { Layer } from '../../core/keymap/model.ts';
import { dragKind } from '../dnd.ts';
import { useReorder } from '../reorder.ts';
import { Icon } from './Icon.tsx';
import { IconButton } from './ui/IconButton.tsx';
import type { EditorAction } from '../state/editorReducer.ts';

interface LayerRailProps {
  layers: Layer[];
  active: number;
  dispatch: Dispatch<EditorAction>;
}

const layerName = (layer: Layer) => layer.displayName ?? layer.name;

/** How long a drag has to rest on a layer tab before switching to that layer. */
export const HOVER_SWITCH_MS = 500;

/**
 * The layers as a floating vertical rail beside the keyboard. Hovering or focusing a
 * row reveals its drag grip, rename and delete; Alt+↑/↓ moves the focused layer.
 */
export function LayerRail({ layers, active, dispatch }: LayerRailProps) {
  const [renaming, setRenaming] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [hovered, setHovered] = useState<number | null>(null);
  const reorder = useReorder('layers', (from, to) => dispatch({ type: 'moveLayer', from, to }));
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const list = useRef<HTMLDivElement>(null);
  /** The layer whose tab gets focus back after a keyboard move (moving a node blurs it). */
  const refocus = useRef<string | null>(null);

  const stopHover = () => {
    clearTimeout(hoverTimer.current);
    setHovered(null);
  };
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  useEffect(() => {
    const name = refocus.current;
    if (name === null) return;
    refocus.current = null;
    list.current?.querySelector<HTMLElement>(`[data-layer="${CSS.escape(name)}"]`)?.focus();
  }, [layers]);

  // Dragging a key or a palette tile over a tab switches to that layer after a moment.
  const onRowDragEnter = (event: DragEvent, index: number) => {
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

  const deleteLayer = (index: number) => {
    const layer = layers[index];
    if (!layer || layers.length <= 1) return;
    if (window.confirm(`Delete layer "${layerName(layer)}"? Keys that switch to it will do nothing.`)) {
      dispatch({ type: 'deleteLayer', index });
    }
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number, layer: Layer) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    const to = event.key === 'ArrowUp' ? index - 1 : index + 1;
    if (to < 0 || to >= layers.length) return;
    event.preventDefault();
    refocus.current = layer.name;
    dispatch({ type: 'moveLayer', from: index, to });
  };

  return (
    <nav className="layer-rail" aria-label="Layers">
      <div ref={list} className="layer-rail-list" role="tablist" aria-label="Layers" aria-orientation="vertical">
        {layers.map((layer, index) => {
          const name = layerName(layer);
          const target = reorder.target(index, 'y');
          return (
            <div
              key={layer.name}
              role="presentation"
              className={`layer-row${index === active ? ' active' : ''}${hovered === index ? ' drag-hover' : ''}${reorder.dropClass(index)}`}
              {...target}
              onDragEnter={(event) => onRowDragEnter(event, index)}
              onDragLeave={(event) => {
                target.onDragLeave(event);
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) stopHover();
              }}
              onDrop={(event) => {
                target.onDrop(event);
                stopHover();
              }}
            >
              <span className="layer-grip" aria-hidden="true" title="Drag to reorder" {...reorder.handle(index)}>
                <Icon name="grip" strokeWidth={3} />
              </span>
              <span className="layer-pill">
                {renaming === index ? (
                  <input
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
                    type="button"
                    role="tab"
                    aria-selected={index === active}
                    className="layer-tab"
                    data-layer={layer.name}
                    onClick={() => dispatch({ type: 'selectLayer', index })}
                    onDoubleClick={() => startRename(index)}
                    onKeyDown={(event) => onTabKey(event, index, layer)}
                    title="Double-click to rename · drag or Alt+↑/↓ to reorder"
                    {...reorder.handle(index)}
                  >
                    <span className="layer-index">{index}</span>
                    {name}
                  </button>
                )}
                <span className="layer-row-actions">
                  <IconButton icon="pencil" label={`Rename layer ${name}`} onClick={() => startRename(index)} />
                  <IconButton
                    icon="trash"
                    label={`Delete layer ${name}`}
                    tone="danger"
                    disabled={layers.length <= 1}
                    onClick={() => deleteLayer(index)}
                  />
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <IconButton icon="plus" label="Add layer" className="layer-add" onClick={addLayer} />
    </nav>
  );
}
