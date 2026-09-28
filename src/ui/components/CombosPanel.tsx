import type { Dispatch } from 'react';
import { COMBO_PROPERTIES } from '../../core/catalog/properties.ts';
import { createCombo, deleteCombo, renameCombo, replaceCombo } from '../../core/keymap/comboEdit.ts';
import { describeBinding } from '../../core/keymap/display.ts';
import type { Combo, KeymapModel } from '../../core/keymap/model.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { BindingEditor } from './BindingEditor.tsx';
import { LabelField } from './LabelField.tsx';
import { PropertyFields } from './PropertyFields.tsx';
import { HelpLink } from '../help/HelpLink.tsx';

interface CombosPanelProps {
  keymap: KeymapModel;
  selected: string | null;
  onSelect: (name: string | null) => void;
  dispatch: Dispatch<EditorAction>;
}

export function CombosPanel({ keymap, selected, onSelect, dispatch }: CombosPanelProps) {
  const combo = keymap.combos.find((c) => c.name === selected);
  const edit = (next: KeymapModel) => dispatch({ type: 'edit', keymap: next });
  const update = (next: Combo) => combo && edit(replaceCombo(keymap, combo.name, next));

  const add = () => {
    const created = createCombo(keymap, []);
    edit({ ...keymap, combos: [...keymap.combos, created] });
    onSelect(created.name);
  };

  return (
    <div className="binding-panel">
      <h2 className="panel-title">Combos</h2>
      <p className="muted small">
        Press several keys together to trigger a combo. <HelpLink to="combos" />
      </p>
      <ul className="item-list" aria-label="Combos">
        {keymap.combos.map((c) => (
          <li key={c.name}>
            <button
              type="button"
              className={`item${c.name === selected ? ' active' : ''}`}
              aria-pressed={c.name === selected}
              onClick={() => onSelect(c.name === selected ? null : c.name)}
            >
              <span className="mono">{c.name}</span>
              <span className="muted small">
                {c.keyPositions.join('+') || 'no keys'} → {describeBinding(c.binding, keymap).main}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="button" onClick={add}>
        + New combo
      </button>

      {combo && (
        <div className="editor-section">
          <LabelField
            key={combo.name}
            label="Name"
            value={combo.name}
            validate={(name) => (/^[A-Za-z0-9_ -]+$/.test(name) ? null : 'Use letters, digits, spaces and _.')}
            onRename={(name) => {
              const next = renameCombo(keymap, combo.name, name);
              edit(next);
              onSelect(next.combos[keymap.combos.indexOf(combo)]?.name ?? null);
            }}
          />
          <div className="field">
            <span className="field-label">Keys</span>
            <span className="mono">{combo.keyPositions.join(' + ') || '—'}</span>
            <span className="field-help">Click keys on the keyboard to add or remove them.</span>
            {combo.keyPositions.length < 2 && <span className="field-error">A combo needs at least two keys.</span>}
          </div>
          <BindingEditor
            key={`${combo.name}-binding`}
            binding={combo.binding}
            keymap={keymap}
            context="key"
            label="Sends"
            onChange={(binding) => update({ ...combo, binding })}
          />
          <div className="field">
            <span className="field-label">Layers</span>
            <div className="chips" role="group" aria-label="Combo layers">
              {keymap.layers.map((layer, i) => {
                const on = combo.layers?.includes(String(i)) ?? false;
                return (
                  <button
                    key={layer.name}
                    type="button"
                    className={`chip${on ? ' active' : ''}`}
                    aria-pressed={on}
                    onClick={() => {
                      const layers = on
                        ? (combo.layers ?? []).filter((l) => l !== String(i))
                        : [...(combo.layers ?? []), String(i)].sort((a, b) => Number(a) - Number(b));
                      const next: Combo = { ...combo };
                      if (layers.length > 0) next.layers = layers;
                      else delete next.layers;
                      update(next);
                    }}
                  >
                    {layer.displayName ?? layer.name}
                  </button>
                );
              })}
            </div>
            <span className="field-help">None selected: the combo works on every layer.</span>
          </div>
          <PropertyFields
            schemas={COMBO_PROPERTIES}
            properties={combo.properties}
            onChange={(properties) => update({ ...combo, properties })}
          />
          <button
            type="button"
            className="button danger"
            onClick={() => {
              edit(deleteCombo(keymap, combo.name));
              onSelect(null);
            }}
          >
            Delete combo
          </button>
        </div>
      )}
    </div>
  );
}
