import { useId, useState, type ReactNode } from 'react';
import { ADAPTIVE_TRIGGER_PROPERTIES } from '../../core/catalog/properties.ts';
import type { DtNode, DtProperty } from '../../core/dts/ast.ts';
import { bindingsFromValues } from '../../core/keymap/bindings.ts';
import { behaviorSource, parseBehaviorSource } from '../../core/keymap/behaviorSource.ts';
import type { Behavior, Binding, KeymapModel } from '../../core/keymap/model.ts';
import { BindingEditor } from './BindingEditor.tsx';
import { PropertyFields } from './PropertyFields.tsx';

interface EditorProps {
  keymap: KeymapModel;
  behavior: Behavior;
  onChange: (behavior: Behavior) => void;
}

const NONE: Binding = { behavior: 'none', params: [] };

function cellsProperty(node: DtNode, name: string): string[] {
  const value = node.properties.find((p) => p.name === name)?.values[0];
  return value?.kind === 'cells' ? value.tokens : [];
}

function childBindings(node: DtNode): Binding[] {
  const property = node.properties.find((p) => p.name === 'bindings');
  return (property && bindingsFromValues(property.values)) ?? [];
}

function setProperty(node: DtNode, property: DtProperty): DtNode {
  const exists = node.properties.some((p) => p.name === property.name);
  return {
    ...node,
    properties: exists ? node.properties.map((p) => (p.name === property.name ? property : p)) : [...node.properties, property],
  };
}

const cells = (name: string, tokens: string[]): DtProperty => ({ name, values: [{ kind: 'cells', tokens }] });
const bindingsProperty = (bindings: Binding[]) => cells('bindings', bindings.flatMap((b) => [`&${b.behavior}`, ...b.params]));

function uniqueChildName(children: DtNode[], base: string): string {
  const taken = new Set(children.map((c) => c.name));
  let n = children.length + 1;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

/** Space-separated key names, committed when the field loses focus. */
function KeysField({ label, help, tokens, onChange }: { label: string; help: string; tokens: string[]; onChange: (tokens: string[]) => void }) {
  const id = useId();
  const [text, setText] = useState(tokens.join(' '));
  const commit = () => {
    const next = text.trim().split(/\s+/).filter(Boolean);
    if (next.length === 0) setText(tokens.join(' '));
    else if (next.join(' ') !== tokens.join(' ')) onChange(next);
  };
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input mono"
        aria-describedby={`${id}-help`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
      <span id={`${id}-help`} className="field-help">
        {help}
      </span>
    </div>
  );
}

/** One child node's bindings: editable when it's a single binding. */
function ChildBinding({ keymap, node, label, onChange }: { keymap: KeymapModel; node: DtNode; label: string; onChange: (node: DtNode) => void }) {
  const bindings = childBindings(node);
  if (bindings.length > 1) {
    return <p className="muted small">Sends {bindings.length} behaviors in a row; edit them in the source below.</p>;
  }
  return (
    <BindingEditor
      binding={bindings[0] ?? NONE}
      keymap={keymap}
      context="key"
      label={label}
      onChange={(b) => onChange(setProperty(node, bindingsProperty([b])))}
    />
  );
}

function ChildList({
  behavior,
  onChange,
  title,
  addLabel,
  create,
  childBase,
  render,
}: EditorProps & {
  title: string;
  addLabel: string;
  create: (name: string) => DtNode;
  childBase: string;
  render: (node: DtNode, set: (node: DtNode) => void, key: string) => ReactNode;
}) {
  const children = behavior.children ?? [];
  const set = (next: DtNode[]) => {
    const updated: Behavior = { ...behavior };
    if (next.length > 0) updated.children = next;
    else delete updated.children;
    onChange(updated);
  };
  return (
    <fieldset className="fieldset">
      <legend>{title}</legend>
      {children.map((child, i) => (
        <div key={child.name} className="tap">
          <div className="row">
            <strong className="grow mono">{child.name}</strong>
            <button type="button" className="icon-button danger" aria-label={`Remove ${child.name}`} onClick={() => set(children.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
          {render(child, (node) => set(children.with(i, node)), child.name)}
        </div>
      ))}
      <button type="button" className="button" onClick={() => set([...children, create(uniqueChildName(children, childBase))])}>
        {addLabel}
      </button>
    </fieldset>
  );
}

/** zmk-leader-key: key sequences typed after the leader key, each running a behavior. */
export function LeaderKeyEditor(props: EditorProps) {
  const { keymap } = props;
  return (
    <ChildList
      {...props}
      title="Sequences"
      childBase="seq"
      addLabel="+ Add sequence"
      create={(name) => ({ name, labels: [], properties: [cells('sequence', ['A']), bindingsProperty([NONE])], children: [] })}
      render={(node, set, key) => (
        <>
          <KeysField
            key={`${key}:${cellsProperty(node, 'sequence').join(' ')}`}
            label="Type after the leader key"
            help="ZMK key names separated by spaces, e.g. B O O T or B N1."
            tokens={cellsProperty(node, 'sequence')}
            onChange={(tokens) => set(setProperty(node, cells('sequence', tokens)))}
          />
          <ChildBinding keymap={keymap} node={node} label={`${node.name} runs`} onChange={set} />
        </>
      )}
    />
  );
}

/** zmk-adaptive-key: a default binding plus triggers on the previous key. */
export function AdaptiveKeyEditor(props: EditorProps) {
  const { keymap, behavior, onChange } = props;
  return (
    <>
      <fieldset className="fieldset">
        <legend>Normally</legend>
        <BindingEditor
          binding={behavior.bindings[0] ?? NONE}
          keymap={keymap}
          context="key"
          label="Normally"
          onChange={(b) => onChange({ ...behavior, bindings: [b] })}
        />
      </fieldset>
      <ChildList
        {...props}
        title="After these keys"
        childBase="trigger"
        addLabel="+ Add trigger"
        create={(name) => ({
          name,
          labels: [],
          properties: [cells('trigger-keys', ['A']), cells('max-prior-idle-ms', ['300']), bindingsProperty([{ behavior: 'kp', params: ['A'] }])],
          children: [],
        })}
        render={(node, set, key) => (
          <>
            <KeysField
              key={`${key}:${cellsProperty(node, 'trigger-keys').join(' ')}`}
              label="When the previous key was"
              help="ZMK key names separated by spaces; any of them triggers."
              tokens={cellsProperty(node, 'trigger-keys')}
              onChange={(tokens) => set(setProperty(node, cells('trigger-keys', tokens)))}
            />
            <ChildBinding keymap={keymap} node={node} label={`${node.name} sends`} onChange={set} />
            <PropertyFields schemas={ADAPTIVE_TRIGGER_PROPERTIES} properties={node.properties} onChange={(properties) => set({ ...node, properties })} />
          </>
        )}
      />
    </>
  );
}

const TRI_STATE_NAMES = ['On first press', 'On later presses', 'When interrupted'];

/** zmk-tri-state: start, continue and interrupt bindings. */
export function TriStateBindings({ keymap, behavior, onChange }: EditorProps) {
  return (
    <>
      {TRI_STATE_NAMES.map((name, i) => (
        <fieldset key={name} className="fieldset">
          <legend>{name}</legend>
          <BindingEditor
            binding={behavior.bindings[i] ?? NONE}
            keymap={keymap}
            context="key"
            label={name}
            onChange={(b) => {
              const bindings = [0, 1, 2].map((j) => (j === i ? b : (behavior.bindings[j] ?? NONE)));
              onChange({ ...behavior, bindings });
            }}
          />
        </fieldset>
      ))}
    </>
  );
}

/** Edit any behavior as devicetree source; applied when it parses. */
export function SourceEditor({ behavior, onChange }: Omit<EditorProps, 'keymap'>) {
  const original = behaviorSource(behavior);
  const [text, setText] = useState(original);
  const [error, setError] = useState<string | null>(null);
  const apply = () => {
    const parsed = parseBehaviorSource(text);
    if (!parsed.ok) return setError(parsed.error);
    if (parsed.behavior.label !== behavior.label) {
      return setError(`Keep the label ${behavior.label}; rename it with the Name field above.`);
    }
    setError(null);
    onChange(parsed.behavior);
  };
  return (
    <div className="field">
      <label className="field-label" htmlFor={`source-${behavior.label ?? behavior.name}`}>
        Source
      </label>
      <textarea
        id={`source-${behavior.label ?? behavior.name}`}
        className="input source-editor"
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error && (
        <p className="notice warn small" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="button" className="button" disabled={text === original} onClick={apply}>
          Apply source
        </button>
        <button type="button" className="button" disabled={text === original} onClick={() => {
            setText(original);
            setError(null);
          }}>
          Revert
        </button>
      </div>
    </div>
  );
}
