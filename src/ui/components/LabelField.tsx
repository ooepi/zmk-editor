import { useState } from 'react';

interface LabelFieldProps {
  label: string;
  value: string;
  /** Returns an error message, or null when the name is fine. */
  validate: (name: string) => string | null;
  onRename: (name: string) => void;
}

/** A name that is applied on Enter or blur, with validation. */
export function LabelField({ label, value, validate, onRename }: LabelFieldProps) {
  const [draft, setDraft] = useState(value);
  const error = draft === value ? null : validate(draft);
  const apply = () => {
    if (draft !== value && !error) onRename(draft);
  };
  return (
    <label className="field">
      <span className="field-label">{label}</span>
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
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
