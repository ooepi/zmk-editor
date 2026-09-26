import { useMemo, useState, type Dispatch } from 'react';
import { BEHAVIOR_GROUPS, behaviorCatalog, findBehavior, type ParamType } from '../../core/catalog/behaviors.ts';
import { keyExpressionLabel } from '../../core/catalog/keycodes.ts';
import { tokenizeCells } from '../../core/dts/cells.ts';
import { formatBinding, parseBindings } from '../../core/keymap/bindings.ts';
import { changeBehavior } from '../../core/keymap/edit.ts';
import type { Binding, KeymapModel } from '../../core/keymap/model.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { KeycodePicker } from './KeycodePicker.tsx';

interface BindingPanelProps {
  keymap: KeymapModel;
  layer: number;
  keyIndex: number;
  dispatch: Dispatch<EditorAction>;
}

const PARAM_NAMES: Record<string, string[]> = {
  mt: ['Hold (modifier)', 'Tap'],
  lt: ['Hold (layer)', 'Tap'],
};

function paramName(ref: string, index: number, count: number, holdParam: number | undefined): string {
  const named = PARAM_NAMES[ref]?.[index];
  if (named) return named;
  if (holdParam !== undefined) return index === holdParam ? 'Hold' : 'Tap';
  return count > 1 ? `Param ${index + 1}` : 'Value';
}

export function BindingPanel({ keymap, layer, keyIndex, dispatch }: BindingPanelProps) {
  const binding = keymap.layers[layer]?.bindings[keyIndex];
  const catalog = useMemo(() => behaviorCatalog(keymap), [keymap]);
  if (!binding) return null;
  const def = findBehavior(catalog, binding.behavior);
  const set = (next: Binding) => dispatch({ type: 'setBinding', binding: next });
  const setParam = (index: number, token: string) => set({ ...binding, params: binding.params.with(index, token) });
  const keycodeParams = def ? def.params.flatMap((p, i) => (p.kind === 'keycode' ? [i] : [])) : [];
  const layerName = keymap.layers[layer]?.displayName ?? keymap.layers[layer]?.name;

  return (
    <div className="binding-panel">
      <h2 className="panel-title">
        Key {keyIndex} · {layerName}
      </h2>

      <label className="field">
        <span className="field-label">Behavior</span>
        <select
          className="input"
          value={binding.behavior}
          onChange={(e) => set(changeBehavior(binding, e.target.value, keymap))}
        >
          {!def && <option value={binding.behavior}>&amp;{binding.behavior} (not in catalog)</option>}
          {BEHAVIOR_GROUPS.map((group) => {
            const defs = catalog.filter((d) => d.group === group.id);
            if (defs.length === 0) return null;
            return (
              <optgroup key={group.id} label={group.label}>
                {defs.map((d) => (
                  <option key={d.ref} value={d.ref}>
                    {d.group === 'custom' ? `&${d.ref}` : d.name}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </label>
      {def && <p className="muted small">{def.description}</p>}

      {def?.params.map((type, index) => (
        <ParamField
          key={`${binding.behavior}-${index}`}
          name={paramName(def.ref, index, def.params.length, def.holdParam)}
          type={type}
          value={binding.params[index] ?? ''}
          extra={binding.params[index + 1]}
          keymap={keymap}
          pickerOpen={index === keycodeParams.at(-1)}
          onChange={(token) => setParam(index, token)}
          onEnumChange={(tokens) => set({ ...binding, params: [...binding.params.slice(0, index), ...tokens] })}
        />
      ))}

      <RawBindingField key={formatBinding(binding)} binding={binding} onChange={set} />

      <div className="row">
        <button type="button" className="button" onClick={() => set({ behavior: 'trans', params: [] })}>
          Transparent
        </button>
        <button type="button" className="button" onClick={() => set({ behavior: 'none', params: [] })}>
          None
        </button>
      </div>
    </div>
  );
}

interface ParamFieldProps {
  name: string;
  type: ParamType;
  value: string;
  /** The following param, for enum options that take a number (`BT_SEL 0`). */
  extra: string | undefined;
  keymap: KeymapModel;
  pickerOpen: boolean;
  onChange: (token: string) => void;
  onEnumChange: (tokens: string[]) => void;
}

function ParamField({ name, type, value, extra, keymap, pickerOpen, onChange, onEnumChange }: ParamFieldProps) {
  const [open, setOpen] = useState(pickerOpen);
  switch (type.kind) {
    case 'keycode':
      return (
        <div className="field">
          <span className="field-label">{name}</span>
          <button type="button" className="input key-value" aria-expanded={open} onClick={() => setOpen(!open)}>
            <strong>{keyExpressionLabel(value)}</strong> <span className="muted">{value}</span>
          </button>
          {open && <KeycodePicker value={value} onChange={onChange} label={`Search keys for ${name}`} />}
        </div>
      );
    case 'layer':
      return (
        <label className="field">
          <span className="field-label">{name}</span>
          <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
            {!keymap.layers.some((_, i) => String(i) === value) && <option value={value}>{value}</option>}
            {keymap.layers.map((layer, i) => (
              <option key={layer.name} value={String(i)}>
                {i} · {layer.displayName ?? layer.name}
              </option>
            ))}
          </select>
        </label>
      );
    case 'enum': {
      const option = type.options.find((o) => o.value === value);
      return (
        <>
          <label className="field">
            <span className="field-label">{name}</span>
            <select
              className="input"
              value={value}
              onChange={(e) => {
                const next = type.options.find((o) => o.value === e.target.value);
                if (next) onEnumChange(next.number ? [next.value, String(next.number.default)] : [next.value]);
              }}
            >
              {!option && <option value={value}>{value}</option>}
              {type.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} ({o.value})
                </option>
              ))}
            </select>
          </label>
          {option?.number && (
            <label className="field">
              <span className="field-label">
                {option.number.label}
                {option.number.offset ? ` (0 = ${option.number.label.toLowerCase()} ${option.number.offset})` : ''}
              </span>
              <input
                className="input"
                type="number"
                min={0}
                value={extra ?? ''}
                onChange={(e) => onEnumChange([value, e.target.value || '0'])}
              />
            </label>
          )}
        </>
      );
    }
    case 'number':
    case 'raw':
      return (
        <label className="field">
          <span className="field-label">{name}</span>
          <input
            className="input mono"
            type={type.kind === 'number' ? 'number' : 'text'}
            value={value}
            onChange={(e) => onChange(e.target.value.trim())}
          />
        </label>
      );
  }
}

/** Edit the binding as source text, e.g. `&kp LC(A)`. */
function RawBindingField({ binding, onChange }: { binding: Binding; onChange: (binding: Binding) => void }) {
  const [text, setText] = useState(formatBinding(binding));
  const parsed = parseBindings(tokenizeCells(text));
  const valid = parsed?.length === 1;
  const apply = () => {
    const [next] = parsed ?? [];
    if (valid && next && formatBinding(next) !== formatBinding(binding)) onChange(next);
  };
  return (
    <label className="field">
      <span className="field-label">Source</span>
      <input
        className={`input mono${valid ? '' : ' invalid'}`}
        value={text}
        aria-invalid={!valid}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply();
        }}
      />
    </label>
  );
}
