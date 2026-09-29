import { useState, type ComponentPropsWithoutRef } from 'react';

type NumberInputProps = {
  value: number | undefined;
  /** The typed number (undefined for an empty field), once the user is done: Enter or leaving the field. */
  onCommit: (value: number | undefined) => void;
} & Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'value' | 'onChange' | 'defaultValue'>;

/**
 * A number field that keeps what's being typed as a draft and writes it once, on Enter or
 * leaving the field, so typing "280" is one undo step, not three. Esc puts the value back.
 */
export function NumberInput({ value, onCommit, onBlur, onKeyDown, ...rest }: NumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const text = draft.trim();
    const next = text === '' ? undefined : Number(text);
    if (next !== undefined && !Number.isFinite(next)) return;
    if (next !== value) onCommit(next);
  };
  return (
    <input
      {...rest}
      type="number"
      value={draft ?? (value === undefined ? '' : String(value))}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        commit();
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape' && draft !== null) {
          // Only undo the typing; a second Esc reaches the app (e.g. to deselect keys).
          e.stopPropagation();
          setDraft(null);
        }
        onKeyDown?.(e);
      }}
    />
  );
}
