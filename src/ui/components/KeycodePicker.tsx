import { useMemo, useState, type KeyboardEvent } from 'react';
import {
  findKeycode,
  formatKeyExpression,
  KEYCODE_CATEGORIES,
  MODIFIER_FUNCTIONS,
  parseKeyExpression,
  preferredName,
  searchKeycodes,
  type KeycodeCategory,
  type ModifierFunction,
} from '../../core/catalog/keycodes.ts';

interface KeycodePickerProps {
  /** Current param token, e.g. `LC(A)`. */
  value: string;
  onChange: (token: string) => void;
  /** Label for the search box. */
  label: string;
}

const RESULT_LIMIT = 150;

export function KeycodePicker({ value, onChange, label }: KeycodePickerProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<KeycodeCategory | undefined>(undefined);
  const expression = parseKeyExpression(value);
  const mods = expression?.mods ?? [];
  const current = expression ? findKeycode(expression.key) : undefined;

  const results = useMemo(() => searchKeycodes(query, category).slice(0, RESULT_LIMIT), [query, category]);

  const pick = (name: string) => onChange(formatKeyExpression({ mods, key: name }));

  const toggleMod = (mod: ModifierFunction) => {
    if (!expression) return;
    const next = mods.includes(mod) ? mods.filter((m) => m !== mod) : [...mods, mod];
    onChange(formatKeyExpression({ mods: next, key: expression.key }));
  };

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    const first = results[0];
    if (event.key === 'Enter' && first) {
      event.preventDefault();
      pick(preferredName(first));
      setQuery('');
    }
  };

  return (
    <div className="picker">
      <input
        className="input"
        type="search"
        placeholder="Search keys: a, esc, volume, !…"
        aria-label={label}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onSearchKey}
      />
      <div className="chips" role="group" aria-label="Key categories">
        {KEYCODE_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chip${category === c.id ? ' active' : ''}`}
            aria-pressed={category === c.id}
            onClick={() => setCategory(category === c.id ? undefined : c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="picker-results" role="listbox" aria-label="Keys">
        {results.map((keycode) => {
          const name = preferredName(keycode);
          const selected = current?.name === keycode.name;
          return (
            <button
              key={keycode.name}
              type="button"
              role="option"
              aria-selected={selected}
              className={`picker-key${selected ? ' selected' : ''}`}
              title={`${keycode.description} (${name})`}
              onClick={() => pick(name)}
            >
              <span className="picker-key-label">{keycode.label}</span>
              <span className="picker-key-name">{name}</span>
            </button>
          );
        })}
        {results.length === 0 && <p className="muted">No keys match.</p>}
      </div>
      <div className="chips" role="group" aria-label="Modifiers held with the key">
        {MODIFIER_FUNCTIONS.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`chip${mods.includes(m.id) ? ' active' : ''}`}
            aria-pressed={mods.includes(m.id)}
            disabled={!expression}
            title={`Hold ${m.name} with the key (${m.id})`}
            onClick={() => toggleMod(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
