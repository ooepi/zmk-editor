import { useId, useState } from 'react';
import {
  MODIFIER_MASKS,
  readProperty,
  writeProperty,
  type PropertySchema,
  type PropertyValue,
} from '../../core/catalog/properties.ts';
import type { DtProperty } from '../../core/dts/ast.ts';

interface PropertyFieldsProps {
  schemas: PropertySchema[];
  properties: DtProperty[];
  onChange: (properties: DtProperty[]) => void;
}

/** Form fields for a behavior's or combo's properties. Empty fields use ZMK's default. */
export function PropertyFields({ schemas, properties, onChange }: PropertyFieldsProps) {
  const set = (schema: PropertySchema, value: PropertyValue | undefined) => onChange(writeProperty(properties, schema, value));
  return (
    <div className="property-fields">
      {schemas.map((schema) => (
        <PropertyField key={schema.name} schema={schema} value={readProperty(properties, schema)} onChange={(v) => set(schema, v)} />
      ))}
    </div>
  );
}

function defaultText(schema: PropertySchema): string {
  if (schema.default === undefined) return '';
  return `default: ${String(schema.default)}`;
}

function PropertyField({
  schema,
  value,
  onChange,
}: {
  schema: PropertySchema;
  value: PropertyValue | undefined;
  onChange: (value: PropertyValue | undefined) => void;
}) {
  const { type } = schema;
  const id = useId();
  const help = <span id={`${id}-help`} className="field-help">{schema.help}</span>;
  switch (type.kind) {
    case 'number':
      return (
        <div className="field">
          <label className="field-label" htmlFor={id}>
            {schema.label}
            {type.unit ? ` (${type.unit})` : ''}
          </label>
          <input
            id={id}
            className="input"
            type="number"
            placeholder={defaultText(schema)}
            aria-describedby={`${id}-help`}
            value={typeof value === 'number' ? value : ''}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          />
          {help}
        </div>
      );
    case 'bool':
      return (
        <div className="field checkbox">
          <input
            id={id}
            type="checkbox"
            aria-describedby={`${id}-help`}
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>
            <label htmlFor={id}>{schema.label}</label>
            {help}
          </span>
        </div>
      );
    case 'enum':
      return (
        <div className="field">
          <label className="field-label" htmlFor={id}>
            {schema.label}
          </label>
          <select
            id={id}
            className="input"
            aria-describedby={`${id}-help`}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value || undefined)}
          >
            <option value="">Default ({String(schema.default)})</option>
            {type.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          {help}
        </div>
      );
    case 'mods': {
      const mods = Array.isArray(value) ? value : [];
      return (
        <div className="field">
          <span className="field-label">{schema.label}</span>
          <div className="chips" role="group" aria-label={schema.label}>
            {MODIFIER_MASKS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`chip${mods.includes(m.id) ? ' active' : ''}`}
                aria-pressed={mods.includes(m.id)}
                onClick={() => onChange(mods.includes(m.id) ? mods.filter((x) => x !== m.id) : [...mods, m.id])}
              >
                {m.label}
              </button>
            ))}
          </div>
          {help}
        </div>
      );
    }
    case 'positions':
      return <PositionsField key={Array.isArray(value) ? value.join(' ') : ''} schema={schema} value={value} onChange={onChange} />;
  }
}

function PositionsField({
  schema,
  value,
  onChange,
}: {
  schema: PropertySchema;
  value: PropertyValue | undefined;
  onChange: (value: PropertyValue | undefined) => void;
}) {
  const [text, setText] = useState(Array.isArray(value) ? value.join(' ') : '');
  const id = useId();
  const apply = () => onChange(text.split(/[\s,]+/).filter(Boolean));
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {schema.label}
      </label>
      <input
        id={id}
        aria-describedby={`${id}-help`}
        className="input mono"
        placeholder="Key numbers, e.g. 6 7 8 9"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply();
        }}
      />
      <span id={`${id}-help`} className="field-help">
        {schema.help}
      </span>
    </div>
  );
}
