import { useMemo, useState } from 'react';
import { describeBinding, displayContext } from '../../core/keymap/display.ts';
import { textToBindings } from '../../core/keymap/macroText.ts';
import type { Behavior, Binding, KeymapModel } from '../../core/keymap/model.ts';
import { moveItem, useReorder } from '../reorder.ts';
import { BindingEditor } from './BindingEditor.tsx';
import { Icon } from './Icon.tsx';

interface MacroStepsProps {
  keymap: KeymapModel;
  behavior: Behavior;
  onChange: (behavior: Behavior) => void;
}

const ADD_STEPS: { label: string; binding: Binding }[] = [
  { label: '+ Key', binding: { behavior: 'kp', params: ['A'] } },
  { label: '+ Press mode', binding: { behavior: 'macro_press', params: [] } },
  { label: '+ Release mode', binding: { behavior: 'macro_release', params: [] } },
  { label: '+ Tap mode', binding: { behavior: 'macro_tap', params: [] } },
  { label: '+ Wait time', binding: { behavior: 'macro_wait_time', params: ['100'] } },
];

/** The steps of a macro: reorder, remove, add, and edit the selected one. */
export function MacroSteps({ keymap, behavior, onChange }: MacroStepsProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [skipped, setSkipped] = useState<string[]>([]);
  const steps = behavior.bindings;
  const labels = useMemo(() => {
    const ctx = displayContext(keymap);
    return steps.map((b) => describeBinding(b, ctx));
  }, [keymap, steps]);

  const setSteps = (bindings: Binding[]) => onChange({ ...behavior, bindings });
  const move = (from: number, to: number) => {
    setSteps(moveItem(steps, from, to));
    setSelected(to);
  };
  const reorder = useReorder('macro-steps', move);
  const add = (bindings: Binding[]) => {
    setSteps([...steps, ...bindings]);
    setSelected(steps.length + bindings.length - 1);
  };
  const typeText = () => {
    const result = textToBindings(text);
    if (result.bindings.length > 0) add(result.bindings);
    setSkipped(result.unsupported);
    setText('');
  };
  const current = selected === null ? undefined : steps[selected];

  return (
    <fieldset className="fieldset">
      <legend>Steps</legend>
      <ol className="steps" aria-label="Macro steps">
        {steps.map((_, i) => {
          const label = labels[i];
          return (
            <li key={i} className={`step${i === selected ? ' active' : ''}${reorder.dropClass(i)}`} {...reorder.handle(i)} {...reorder.target(i)}>
              <span className="grip" aria-hidden="true" title="Drag to reorder">
                <Icon name="grip" size={14} strokeWidth={3} />
              </span>
              <button
                type="button"
                className="step-main"
                aria-pressed={i === selected}
                onClick={() => setSelected(i === selected ? null : i)}
              >
                <span className="step-index">{i + 1}</span>
                <span className={`step-label kind-${label?.kind ?? 'other'}`}>{label?.main}</span>
                {label?.sub && <span className="muted small">{label.sub}</span>}
              </button>
              <button type="button" className="icon-button" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                ↑
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`Move step ${i + 1} down`}
                disabled={i === steps.length - 1}
                onClick={() => move(i, i + 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="icon-button danger"
                aria-label={`Remove step ${i + 1}`}
                onClick={() => {
                  setSteps(steps.filter((_, j) => j !== i));
                  setSelected(null);
                }}
              >
                ✕
              </button>
            </li>
          );
        })}
        {steps.length === 0 && <li className="muted small">No steps yet.</li>}
      </ol>

      <div className="row wrap">
        {ADD_STEPS.map((s) => (
          <button key={s.label} type="button" className="button" onClick={() => add([s.binding])}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="row">
        <input
          className="input"
          aria-label="Text to type"
          placeholder="Type text, e.g. Hello!"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text) typeText();
          }}
        />
        <button type="button" className="button" disabled={!text} onClick={typeText}>
          Add text
        </button>
      </div>
      {skipped.length > 0 && (
        <p className="field-error">Skipped characters without a key on a US layout: {skipped.join(' ')}</p>
      )}

      {current && selected !== null && (
        <div className="editor-section">
          <h3 className="panel-title">Step {selected + 1}</h3>
          <BindingEditor
            key={selected}
            binding={current}
            keymap={keymap}
            context="macro"
            onChange={(b) => setSteps(steps.with(selected, b))}
          />
        </div>
      )}
    </fieldset>
  );
}
