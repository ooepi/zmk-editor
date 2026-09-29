import { useMemo, useState } from 'react';
import {
  behaviorCatalog,
  findBehavior,
  offeredIn,
  type BehaviorDef,
  type BindingContext,
  type ParamType,
} from '../../core/catalog/behaviors.ts';
import { keyExpressionLabel } from '../../core/catalog/keycodes.ts';
import { tokenizeCells } from '../../core/dts/cells.ts';
import { formatBinding, parseBindings } from '../../core/keymap/bindings.ts';
import { changeBehavior } from '../../core/keymap/edit.ts';
import type { Binding, KeymapModel } from '../../core/keymap/model.ts';
import { BehaviorSelect } from './BehaviorSelect.tsx';
import { KeycodePicker } from './KeycodePicker.tsx';
import { UnicodePicker } from './UnicodePicker.tsx';
import { NumberInput } from './ui/NumberInput.tsx';

const PARAM_NAMES: Record<string, string[]> = {
  mt: ['Hold (modifier)', 'Tap'],
  lt: ['Hold (layer)', 'Tap'],
  inc_dec_kp: ['Clockwise', 'Counter-clockwise'],
};

function paramName(def: BehaviorDef, index: number): string {
  const named = PARAM_NAMES[def.ref]?.[index];
  if (named) return named;
  if (def.holdParam !== undefined) return index === def.holdParam ? 'Hold' : 'Tap';
  return def.params.length > 1 ? `Param ${index + 1}` : 'Value';
}

interface BindingEditorProps {
  binding: Binding;
  keymap: KeymapModel;
  context: BindingContext;
  onChange: (binding: Binding) => void;
  /** Prefix for field labels when several editors share a page, e.g. "Clockwise". */
  label?: string;
  /** Show the Transparent / None shortcuts. */
  shortcuts?: boolean;
}

export function BindingEditor({ binding, keymap, context, onChange, label, shortcuts = false }: BindingEditorProps) {
  const catalog = useMemo(() => behaviorCatalog(keymap), [keymap]);
  const def = findBehavior(catalog, binding.behavior);
  const offered = catalog.filter((d) => offeredIn(context, d));
  const setParam = (index: number, token: string) => onChange({ ...binding, params: binding.params.with(index, token) });
  const keycodeParams = def ? def.params.flatMap((p, i) => (p.kind === 'keycode' ? [i] : [])) : [];
  const prefix = label ? `${label}: ` : '';

  return (
    <div className="binding-editor">
      <div className="field">
        <span className="field-label" aria-hidden="true">
          {prefix}Behavior
        </span>
        <BehaviorSelect
          value={binding.behavior}
          options={offered}
          label={`${prefix}Behavior`}
          onChange={(ref) => onChange(changeBehavior(binding, ref, keymap))}
        />
      </div>
      {def && <p className="muted small">{def.description}</p>}

      {def?.params.map((type, index) =>
        type.kind === 'unicode' ? (
          <UnicodePicker
            key={`${binding.behavior}-${index}`}
            params={binding.params.slice(index)}
            onChange={(tokens) => onChange({ ...binding, params: [...binding.params.slice(0, index), ...tokens] })}
          />
        ) : (
        <ParamField
          key={`${binding.behavior}-${index}`}
          name={prefix + paramName(def, index)}
          type={type}
          value={binding.params[index] ?? ''}
          extra={binding.params[index + 1]}
          keymap={keymap}
          pickerOpen={index === keycodeParams.at(-1)}
          onChange={(token) => setParam(index, token)}
          onEnumChange={(tokens) => onChange({ ...binding, params: [...binding.params.slice(0, index), ...tokens] })}
        />
        ),
      )}

      <RawBindingField key={formatBinding(binding)} binding={binding} label={`${prefix}Source`} onChange={onChange} />

      {shortcuts && (
        <div className="row">
          <button type="button" className="button" onClick={() => onChange({ behavior: 'trans', params: [] })}>
            Transparent
          </button>
          <button type="button" className="button" onClick={() => onChange({ behavior: 'none', params: [] })}>
            None
          </button>
        </div>
      )}
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
              <NumberInput
                className="input"
                min={0}
                value={extra === undefined || extra === '' ? undefined : Number(extra)}
                onCommit={(n) => onEnumChange([value, String(n ?? 0)])}
              />
            </label>
          )}
        </>
      );
    }
    case 'number':
    case 'unicode':
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
function RawBindingField({ binding, label, onChange }: { binding: Binding; label: string; onChange: (binding: Binding) => void }) {
  const [text, setText] = useState(formatBinding(binding));
  const parsed = parseBindings(tokenizeCells(text));
  const valid = parsed?.length === 1;
  const apply = () => {
    const [next] = parsed ?? [];
    if (valid && next && formatBinding(next) !== formatBinding(binding)) onChange(next);
  };
  return (
    <label className="field">
      <span className="field-label">{label}</span>
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
