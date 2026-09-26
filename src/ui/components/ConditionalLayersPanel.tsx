import type { Dispatch } from 'react';
import { getConditionalLayers, setConditionalLayers, type ConditionalLayer } from '../../core/keymap/conditional.ts';
import { nodeName } from '../../core/keymap/edit.ts';
import type { KeymapModel } from '../../core/keymap/model.ts';
import type { EditorAction } from '../state/editorReducer.ts';

/** "When these layers are on, turn on that one", e.g. Lower + Raise = Adjust. */
export function ConditionalLayersPanel({ keymap, dispatch }: { keymap: KeymapModel; dispatch: Dispatch<EditorAction> }) {
  const list = getConditionalLayers(keymap);
  const save = (next: ConditionalLayer[]) => dispatch({ type: 'edit', keymap: setConditionalLayers(keymap, next) });
  const layerName = (token: string) => {
    const layer = keymap.layers[Number(token)];
    return layer ? (layer.displayName ?? layer.name) : token;
  };
  const add = () => {
    const n = keymap.layers.length;
    const name = nodeName('tri layer', new Set(list.map((c) => c.name)), 'conditional');
    save([...list, { name, ifLayers: [String(Math.min(1, n - 1)), String(Math.min(2, n - 1))], thenLayer: String(Math.min(3, n - 1)) }]);
  };

  return (
    <section aria-label="Conditional layers">
      <h2 className="panel-title">Conditional layers</h2>
      <p className="muted small">Turn on a layer while several others are on, e.g. Lower + Raise = Adjust.</p>
      {list.map((c, i) => (
        <div key={c.name} className="conditional">
          <div className="chips" role="group" aria-label={`When these layers are on (${c.name})`}>
            {keymap.layers.map((layer, index) => {
              const on = c.ifLayers.includes(String(index));
              return (
                <button
                  key={layer.name}
                  type="button"
                  className={`chip${on ? ' active' : ''}`}
                  aria-pressed={on}
                  onClick={() => {
                    const ifLayers = on
                      ? c.ifLayers.filter((l) => l !== String(index))
                      : [...c.ifLayers, String(index)].sort((a, b) => Number(a) - Number(b));
                    save(list.with(i, { ...c, ifLayers }));
                  }}
                >
                  {layer.displayName ?? layer.name}
                </button>
              );
            })}
          </div>
          <div className="row">
            <label className="field grow">
              <span className="field-label">Turn on ({c.ifLayers.map(layerName).join(' + ') || 'choose layers'})</span>
              <select className="input" value={c.thenLayer} onChange={(e) => save(list.with(i, { ...c, thenLayer: e.target.value }))}>
                {keymap.layers.map((layer, index) => (
                  <option key={layer.name} value={String(index)}>
                    {layer.displayName ?? layer.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="icon-button danger" aria-label={`Remove ${c.name}`} onClick={() => save(list.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
          {c.ifLayers.length < 2 && <span className="field-error">Choose at least two layers.</span>}
        </div>
      ))}
      <button type="button" className="button" disabled={keymap.layers.length < 3} onClick={add}>
        + Conditional layer
      </button>
    </section>
  );
}
