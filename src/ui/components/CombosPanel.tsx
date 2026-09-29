import type { Dispatch } from 'react';
import { COMBO_PROPERTIES } from '../../core/catalog/properties.ts';
import { comboParts, createCombo, deleteCombo, renameCombo, replaceCombo } from '../../core/keymap/comboEdit.ts';
import type { Combo, KeymapModel } from '../../core/keymap/model.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { BindingEditor } from './BindingEditor.tsx';
import { LabelField } from './LabelField.tsx';
import { PropertyFields } from './PropertyFields.tsx';
import { HelpLink } from '../help/HelpLink.tsx';

interface CombosPanelProps {
  keymap: KeymapModel;
  /** The open combo, if any. */
  selected: string | null;
  /** Done was refused: the open combo needs at least two keys. */
  blocked: boolean;
  onSelect: (name: string | null) => void;
  /** Close the open combo (the same as Done over the keyboard, or Esc). */
  onDone: () => void;
  dispatch: Dispatch<EditorAction>;
}

/** Keys as little keycaps joined by +, then what the combo sends. */
function ComboFormula({ keys, sends }: { keys: string[]; sends: string }) {
  return (
    <span className="combo-formula">
      {keys.length === 0 ? (
        <span className="muted small">No keys yet</span>
      ) : (
        keys.map((label, i) => (
          <span key={i} className="combo-formula-part">
            {i > 0 && <span className="combo-formula-op">+</span>}
            <kbd className="mini-key">{label}</kbd>
          </span>
        ))
      )}
      <span className="combo-formula-op">→</span>
      <kbd className="mini-key sends">{sends}</kbd>
    </span>
  );
}

function layerNames(combo: Combo, keymap: KeymapModel): string[] {
  return (combo.layers ?? []).map((i) => {
    const layer = keymap.layers[Number(i)];
    return layer ? (layer.displayName ?? layer.name) : i;
  });
}

export function CombosPanel({ keymap, selected, blocked, onSelect, onDone, dispatch }: CombosPanelProps) {
  const combo = keymap.combos.find((c) => c.name === selected);
  const edit = (next: KeymapModel) => dispatch({ type: 'edit', keymap: next });
  const update = (next: Combo) => combo && edit(replaceCombo(keymap, combo.name, next));

  const add = () => {
    const created = createCombo(keymap, []);
    edit({ ...keymap, combos: [...keymap.combos, created] });
    onSelect(created.name);
  };

  if (combo) {
    const parts = comboParts(combo, keymap);
    const hasOptions = (combo.layers?.length ?? 0) > 0 || combo.properties.length > 0;
    return (
      <div className="binding-panel combo-editor">
        <div className="combo-editor-head">
          <h2 className="panel-title">Combo</h2>
          <button type="button" className="button primary" onClick={onDone}>
            Done
          </button>
        </div>
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

        <section className="combo-step" aria-label="Keys">
          <h3 className="combo-step-title">
            <span className="step-no">1</span> Keys
          </h3>
          {parts.keys.length > 0 ? (
            <ComboFormula keys={parts.keys} sends={parts.sends} />
          ) : (
            <p className="muted small">Click keys on the keyboard to add them. Click one again to remove it.</p>
          )}
          {combo.keyPositions.length < 2 && (
            <span className={blocked ? 'field-error' : 'field-help'}>
              {blocked ? 'Pick at least two keys, or delete this combo.' : 'A combo needs at least two keys.'}
            </span>
          )}
        </section>

        <section className="combo-step" aria-label="Sends">
          <h3 className="combo-step-title">
            <span className="step-no">2</span> Sends
          </h3>
          <BindingEditor
            key={`${combo.name}-binding`}
            binding={combo.binding}
            keymap={keymap}
            context="key"
            label="Sends"
            onChange={(binding) => update({ ...combo, binding })}
          />
        </section>

        <details className="combo-step combo-options" open={hasOptions}>
          <summary className="combo-step-title">
            <span className="step-no">3</span> Options <span className="muted small">layers and timing</span>
          </summary>
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
          <PropertyFields schemas={COMBO_PROPERTIES} properties={combo.properties} onChange={(properties) => update({ ...combo, properties })} />
        </details>

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
    );
  }

  return (
    <div className="binding-panel">
      <h2 className="panel-title">Combos</h2>
      <p className="muted small">
        Press several keys together to send something else, like J+K for Esc. <HelpLink to="combos" />
      </p>
      <ul className="item-list" aria-label="Combos">
        {keymap.combos.map((c) => {
          const parts = comboParts(c, keymap);
          const layers = layerNames(c, keymap);
          return (
            <li key={c.name}>
              <button type="button" className="item combo-item" aria-pressed={false} onClick={() => onSelect(c.name)}>
                <span className="combo-item-head">
                  <span className="mono small">{c.name}</span>
                  {c.keyPositions.length < 2 && <span className="badge warn">Needs 2 keys</span>}
                  {layers.length > 0 && <span className="badge">{layers.join(', ')}</span>}
                </span>
                <ComboFormula keys={parts.keys} sends={parts.sends} />
              </button>
            </li>
          );
        })}
        {keymap.combos.length === 0 && <li className="muted small">No combos yet.</li>}
      </ul>
      <button type="button" className="button primary" onClick={add}>
        + New combo
      </button>
    </div>
  );
}
