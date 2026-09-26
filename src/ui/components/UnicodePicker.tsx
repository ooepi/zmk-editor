import { useMemo, useState, type KeyboardEvent } from 'react';
import {
  paramsForCharacter,
  searchUnicode,
  unicodeLabel,
  UNICODE_LANGUAGES,
  UNICODE_MODES,
} from '../../core/catalog/unicode.ts';
import { usePreferences } from '../state/preferences.ts';

interface UnicodePickerProps {
  /** The current `&uc` params. */
  params: string[];
  onChange: (params: string[]) => void;
}

const RESULT_LIMIT = 120;

/** Pick a character for `&uc`: aliases by language, any typed character, or a mode switch. */
export function UnicodePicker({ params, onChange }: UnicodePickerProps) {
  const { unicodeLanguages } = usePreferences();
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState<string | undefined>(undefined);
  const results = useMemo(
    () => searchUnicode(query, language, unicodeLanguages).slice(0, RESULT_LIMIT),
    [query, language, unicodeLanguages],
  );
  const current = unicodeLabel(params);
  const typed = [...query.trim()].length === 1 ? query.trim() : undefined;
  const languages = [...unicodeLanguages, ...UNICODE_LANGUAGES.filter((l) => !unicodeLanguages.includes(l))];

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const first = results[0];
    if (first) onChange([first.name]);
    else if (typed) onChange(paramsForCharacter(typed));
    setQuery('');
  };

  return (
    <div className="field">
      <span className="field-label">Character</span>
      <div className="input key-value">
        <strong>{current.main}</strong>
        {current.sub && <span className="muted">Shift: {current.sub}</span>}
        <span className="muted">{params.join(' ')}</span>
      </div>
      <div className="picker">
        <input
          className="input"
          type="search"
          aria-label="Search characters"
          placeholder="Type a character (ä) or a name (sv_ae)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
        />
        <div className="chips" role="group" aria-label="Languages">
          {languages.map((l) => (
            <button
              key={l}
              type="button"
              className={`chip${language === l ? ' active' : ''}`}
              aria-pressed={language === l}
              onClick={() => setLanguage(language === l ? undefined : l)}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="picker-results" role="listbox" aria-label="Characters">
          {typed && !results.some((r) => r.char === typed) && (
            <button type="button" role="option" aria-selected={false} className="picker-key" onClick={() => onChange(paramsForCharacter(typed))}>
              <span className="picker-key-label">{typed}</span>
              <span className="picker-key-name">{paramsForCharacter(typed).join(' ')}</span>
            </button>
          )}
          {results.map((alias) => (
            <button
              key={alias.name}
              type="button"
              role="option"
              aria-selected={params[0] === alias.name}
              className={`picker-key${params[0] === alias.name ? ' selected' : ''}`}
              title={`${alias.char} / ${alias.shifted} (${alias.language})`}
              onClick={() => onChange([alias.name])}
            >
              <span className="picker-key-label">{alias.char}</span>
              <span className="picker-key-name">{alias.name}</span>
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Switch input mode">
          {UNICODE_MODES.map((m) => (
            <button key={m.id} type="button" className="chip" title={`A key that switches Unicode input to ${m.label}`} onClick={() => onChange([m.set])}>
              → {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
