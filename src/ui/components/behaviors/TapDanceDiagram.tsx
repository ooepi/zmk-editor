import { useMemo, useState } from 'react';
import { describeBinding, displayContext } from '../../../core/keymap/display.ts';
import type { Behavior, Binding, KeymapModel } from '../../../core/keymap/model.ts';
import { moveItem, useReorder } from '../../reorder.ts';
import { BindingEditor } from '../BindingEditor.tsx';
import { Icon } from '../Icon.tsx';
import { IconButton } from '../ui/IconButton.tsx';

interface TapDanceDiagramProps {
  keymap: KeymapModel;
  behavior: Behavior;
  onChange: (behavior: Behavior) => void;
}

const tapName = (i: number) => `${i + 1} tap${i === 0 ? '' : 's'}`;

/**
 * One card per number of taps (1×, 2×, …) in a row; drag a card's header to reorder.
 * Click a card to edit what it sends, below the row.
 */
export function TapDanceDiagram({ keymap, behavior, onChange }: TapDanceDiagramProps) {
  const taps = behavior.bindings;
  const [selectedTap, setSelectedTap] = useState(0);
  const selected = Math.min(selectedTap, taps.length - 1);
  const set = (bindings: Binding[]) => onChange({ ...behavior, bindings });
  // The edited tap moves with its card.
  const move = (from: number, to: number) => {
    set(moveItem(taps, from, to));
    if (from === selected) setSelectedTap(to);
    else if (from < selected && to >= selected) setSelectedTap(selected - 1);
    else if (from > selected && to <= selected) setSelectedTap(selected + 1);
  };
  const reorder = useReorder('tap-dance', move);
  const labels = useMemo(() => {
    const ctx = displayContext(keymap);
    return taps.map((b) => describeBinding(b, ctx).main);
  }, [keymap, taps]);
  const binding = taps[selected];

  return (
    <section className="diagram-card" aria-label="Taps">
      <div className="td-row">
        {taps.map((_, i) => {
          const name = tapName(i);
          return (
            <div
              key={i}
              className={`td-card${i === selected ? ' active' : ''}${reorder.dropClass(i, i === taps.length - 1)}`}
              {...reorder.target(i, 'x')}
            >
              <div className="tap-header" {...reorder.handle(i)}>
                <span className="grip" aria-hidden="true" title="Drag to reorder">
                  <Icon name="grip" size={14} strokeWidth={3} />
                </span>
                <span className="td-count">{i + 1}×</span>
                <span className="grow" />
                <IconButton
                  icon="left"
                  label={`Move ${name} up`}
                  className="small"
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                />
                <IconButton
                  icon="right"
                  label={`Move ${name} down`}
                  className="small"
                  disabled={i === taps.length - 1}
                  onClick={() => move(i, i + 1)}
                />
                <IconButton
                  icon="x"
                  label={`Remove ${name}`}
                  className="small"
                  tone="danger"
                  disabled={taps.length <= 1}
                  onClick={() => {
                    set(taps.filter((_, j) => j !== i));
                    // Keep editing the same tap; it shifts left when an earlier one goes.
                    if (i < selected) setSelectedTap(selected - 1);
                  }}
                />
              </div>
              <button
                type="button"
                className="td-key"
                aria-pressed={i === selected}
                aria-label={`Edit ${name}`}
                onClick={() => setSelectedTap(i)}
              >
                <kbd className="big-key">{labels[i]}</kbd>
                <span className="td-name">{name}</span>
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="td-add"
          aria-label="+ Add tap"
          onClick={() => {
            set([...taps, { behavior: 'kp', params: ['A'] }]);
            setSelectedTap(taps.length);
          }}
        >
          <Icon name="plus" size={20} />
          <span>{taps.length + 1}×</span>
        </button>
      </div>
      {binding && (
        <div className="td-editor">
          <h3 className="diagram-title">{tapName(selected)} sends</h3>
          <BindingEditor
            key={selected}
            binding={binding}
            keymap={keymap}
            context="key"
            label={tapName(selected)}
            onChange={(b) => set(taps.with(selected, b))}
          />
        </div>
      )}
    </section>
  );
}
