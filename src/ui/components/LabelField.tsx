import { useState } from 'react';

interface LabelFieldProps {
  label: string;
  value: string;
  /** Returns an error message, or null when the name is fine. */
  validate: (name: string) => string | null;
  onRename: (name: string) => void;
  /** Shown before the input, e.g. `&` for behavior names. */
  prefix?: string;
}

/** A name that is applied on Enter or blur, with validation. */
export function LabelField({ label, value, validate, onRename, prefix }: LabelFieldProps) {
  const [draft, setDraft] = useState(value);
  const error = draft === value ? null : validate(draft);
  const apply = () => {
    if (draft !== value && !error) onRename(draft);
  };
  const input = (
    <input
      className={`input mono${error ? ' invalid' : ''}`}
      value={draft}
      aria-invalid={error !== null}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={apply}
      onKeyDown={(e) => {
        if (e.key === 'Enter') apply();
        if (e.key === 'Escape') setDraft(value);
      }}
    />
  );
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {prefix ? (
        <span className="input-prefixed">
          <span className="input-prefix mono" aria-hidden="true">
            {prefix}
          </span>
          {input}
        </span>
      ) : (
        input
      )}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
