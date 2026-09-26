import { useMemo, type Dispatch } from 'react';
import { BUILTIN_BEHAVIORS } from '../../core/catalog/behaviors.ts';
import { propertySchema } from '../../core/catalog/properties.ts';
import { printNode } from '../../core/dts/printer.ts';
import {
  createBehavior,
  deleteBehavior,
  renameBehavior,
  replaceBehavior,
  validLabel,
  type NewBehaviorKind,
} from '../../core/keymap/behaviorEdit.ts';
import { behaviorKind, type Behavior, type Binding, type KeymapModel } from '../../core/keymap/model.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { BindingEditor } from './BindingEditor.tsx';
import { LabelField } from './LabelField.tsx';
import { MacroSteps } from './MacroSteps.tsx';
import { PropertyFields } from './PropertyFields.tsx';

interface BehaviorsViewProps {
  keymap: KeymapModel;
  /** `macro` lists macros; `behaviors` lists everything else. */
  kind: 'behaviors' | 'macros';
  selected: string | null;
  onSelect: (label: string | null) => void;
  dispatch: Dispatch<EditorAction>;
}

const KIND_LABELS: Record<string, string> = {
  'hold-tap': 'Hold-tap',
  'mod-morph': 'Mod-morph',
  'sensor-rotate': 'Encoder',
  'tap-dance': 'Tap-dance',
  macro: 'Macro',
  other: 'Other',
};

const NEW_BEHAVIORS: { kind: NewBehaviorKind; label: string }[] = [
  { kind: 'hold-tap', label: '+ Hold-tap' },
  { kind: 'mod-morph', label: '+ Mod-morph' },
  { kind: 'sensor-rotate', label: '+ Encoder behavior' },
  { kind: 'tap-dance', label: '+ Tap-dance' },
];

/** Lists the keymap's behaviors (or macros) and edits the selected one. */
export function BehaviorsView({ keymap, kind, selected, onSelect, dispatch }: BehaviorsViewProps) {
  const isMacros = kind === 'macros';
  const list = keymap.behaviors.filter((b) => (behaviorKind(b) === 'macro') === isMacros);
  const behavior = list.find((b) => b.label === selected);
  const edit = (next: KeymapModel, notice?: string) =>
    dispatch(notice ? { type: 'edit', keymap: next, notice } : { type: 'edit', keymap: next });

  const add = (newKind: NewBehaviorKind) => {
    const created = createBehavior(keymap, newKind);
    edit({ ...keymap, behaviors: [...keymap.behaviors, created] });
    onSelect(created.label ?? null);
  };

  return (
    <div className="split">
      <div className="split-list">
        <h2 className="panel-title">{isMacros ? 'Macros' : 'Behaviors'}</h2>
        <ul className="item-list" aria-label={isMacros ? 'Macros' : 'Behaviors'}>
          {list.map((b) => (
            <li key={b.label ?? b.name}>
              <button
                type="button"
                className={`item${b.label === selected ? ' active' : ''}`}
                aria-pressed={b.label === selected}
                onClick={() => onSelect(b.label ?? null)}
              >
                <span className="mono">&amp;{b.label ?? b.name}</span>
                <span className="badge">{KIND_LABELS[behaviorKind(b)]}</span>
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="muted small">None yet.</li>}
        </ul>
        <div className="stack">
          {isMacros ? (
            <button type="button" className="button" onClick={() => add('macro')}>
              + New macro
            </button>
          ) : (
            NEW_BEHAVIORS.map((n) => (
              <button key={n.kind} type="button" className="button" onClick={() => add(n.kind)}>
                {n.label}
              </button>
            ))
          )}
        </div>
      </div>
      <div className="split-editor">
        {behavior?.label ? (
          <BehaviorEditor
            key={behavior.label}
            keymap={keymap}
            behavior={behavior}
            label={behavior.label}
            onChange={(next) => edit(replaceBehavior(keymap, behavior.label ?? '', next))}
            onRename={(to) => {
              edit(renameBehavior(keymap, behavior.label ?? '', to));
              onSelect(to);
            }}
            onDelete={() => {
              const { model, replaced } = deleteBehavior(keymap, behavior.label ?? '');
              edit(model, replaced > 0 ? `Deleted &${behavior.label}; ${replaced} binding${replaced > 1 ? 's' : ''} using it now do nothing.` : undefined);
              onSelect(null);
            }}
          />
        ) : (
          <p className="muted">
            {isMacros
              ? 'Macros send a sequence of keys. Select one, or create a new one.'
              : 'Hold-taps do one thing when tapped and another when held; mod-morphs change with a modifier; encoder behaviors turn knobs into keys; tap-dances send something different for 1, 2, 3… taps. Select one, or create a new one.'}
          </p>
        )}
      </div>
    </div>
  );
}

interface BehaviorEditorProps {
  keymap: KeymapModel;
  behavior: Behavior;
  label: string;
  onChange: (behavior: Behavior) => void;
  onRename: (label: string) => void;
  onDelete: () => void;
}

function BehaviorEditor({ keymap, behavior, label, onChange, onRename, onDelete }: BehaviorEditorProps) {
  const kind = behaviorKind(behavior);
  const schemas = propertySchema(behavior.compatible);
  const setBinding = (index: number, binding: Binding) =>
    onChange({ ...behavior, bindings: behavior.bindings.with(index, binding) });

  return (
    <div className="behavior-editor">
      <div className="editor-header">
        <span className="badge">{KIND_LABELS[kind]}</span>
        <button
          type="button"
          className="button danger"
          onClick={() => {
            if (window.confirm(`Delete &${label}? Keys using it will do nothing.`)) onDelete();
          }}
        >
          Delete
        </button>
      </div>
      <LabelField label="Name (use it as &name)" value={label} validate={(name) => validLabel(keymap, name, label)} onRename={onRename} />

      {kind === 'hold-tap' && <HoldTapBindings behavior={behavior} onChange={onChange} />}
      {(kind === 'mod-morph' || kind === 'sensor-rotate') &&
        [0, 1].map((i) => {
          const binding = behavior.bindings[i] ?? { behavior: 'none', params: [] };
          const names = kind === 'mod-morph' ? ['Normally', 'With modifier'] : ['Clockwise', 'Counter-clockwise'];
          return (
            <fieldset key={i} className="fieldset">
              <legend>{names[i]}</legend>
              <BindingEditor binding={binding} keymap={keymap} context="key" label={names[i]} onChange={(b) => setBinding(i, b)} />
            </fieldset>
          );
        })}
      {kind === 'macro' && <MacroSteps keymap={keymap} behavior={behavior} onChange={onChange} />}
      {kind === 'tap-dance' && <TapDanceTaps keymap={keymap} behavior={behavior} onChange={onChange} />}

      {schemas && kind !== 'other' ? (
        <fieldset className="fieldset">
          <legend>Settings</legend>
          <PropertyFields schemas={schemas} properties={behavior.properties} onChange={(properties) => onChange({ ...behavior, properties })} />
        </fieldset>
      ) : (
        kind !== 'macro' && <SourcePreview behavior={behavior} />
      )}
      {kind !== 'sensor-rotate' && (
        <p className="muted small">Use it on a key: select the key and choose &amp;{label} under “Your behaviors”.</p>
      )}
    </div>
  );
}

/** What each number of taps sends: 1 tap, 2 taps, … */
function TapDanceTaps({ keymap, behavior, onChange }: { keymap: KeymapModel; behavior: Behavior; onChange: (b: Behavior) => void }) {
  const taps = behavior.bindings;
  const set = (bindings: Binding[]) => onChange({ ...behavior, bindings });
  return (
    <fieldset className="fieldset">
      <legend>Taps</legend>
      {taps.map((binding, i) => {
        const name = `${i + 1} tap${i === 0 ? '' : 's'}`;
        return (
          <div key={i} className="tap">
            <div className="row">
              <strong className="grow">{name}</strong>
              <button
                type="button"
                className="icon-button danger"
                aria-label={`Remove ${name}`}
                disabled={taps.length <= 1}
                onClick={() => set(taps.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
            <BindingEditor binding={binding} keymap={keymap} context="key" label={name} onChange={(b) => set(taps.with(i, b))} />
          </div>
        );
      })}
      <button type="button" className="button" onClick={() => set([...taps, { behavior: 'kp', params: ['A'] }])}>
        + Add tap
      </button>
    </fieldset>
  );
}

/** Hold-tap bindings are behavior references without params, like `<&kp>, <&kp>`. */
const HOLD_TAP_REFS = BUILTIN_BEHAVIORS.filter((d) => d.params.length === 1 && (d.group === 'keys' || d.group === 'layers'));

function HoldTapBindings({ behavior, onChange }: { behavior: Behavior; onChange: (b: Behavior) => void }) {
  return (
    <div className="row wrap">
      {['Hold', 'Tap'].map((name, i) => (
        <label key={name} className="field grow">
          <span className="field-label">{name} behavior</span>
          <select
            className="input"
            value={behavior.bindings[i]?.behavior ?? ''}
            onChange={(e) => onChange({ ...behavior, bindings: behavior.bindings.with(i, { behavior: e.target.value, params: [] }) })}
          >
            {!HOLD_TAP_REFS.some((d) => d.ref === behavior.bindings[i]?.behavior) && (
              <option value={behavior.bindings[i]?.behavior}>&amp;{behavior.bindings[i]?.behavior}</option>
            )}
            {HOLD_TAP_REFS.map((d) => (
              <option key={d.ref} value={d.ref}>
                {d.name} (&amp;{d.ref})
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

function SourcePreview({ behavior }: { behavior: Behavior }) {
  const source = useMemo(
    () =>
      printNode(
        {
          name: behavior.name,
          labels: behavior.label ? [behavior.label] : [],
          properties: [
            { name: 'compatible', values: [{ kind: 'string', value: behavior.compatible }] },
            ...behavior.properties,
            ...(behavior.bindings.length > 0
              ? [
                  {
                    name: 'bindings',
                    values: behavior.bindings.map((b) => ({ kind: 'cells' as const, tokens: [`&${b.behavior}`, ...b.params] })),
                  },
                ]
              : []),
          ],
          children: [],
        },
        0,
      ),
    [behavior],
  );
  return (
    <div className="field">
      <span className="field-label">Source (not editable here yet)</span>
      <pre className="source">{source}</pre>
    </div>
  );
}
