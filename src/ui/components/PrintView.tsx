import { useMemo, useState } from 'react';
import { findKeyboard } from '../../core/catalog/keyboards.ts';
import type { ZmkConfig } from '../../core/config.ts';
import { comboRows } from '../../core/keymap/cheatsheet.ts';
import type { PhysicalLayout } from '../../core/layouts/index.ts';
import { EncoderStrip } from './EncoderStrip.tsx';
import { KeyboardCanvas } from './KeyboardCanvas.tsx';

interface PrintViewProps {
  config: ZmkConfig;
  layout: PhysicalLayout;
  onClose: () => void;
}

const nothing = () => undefined;

/** A printable cheat sheet: every chosen layer as a keyboard diagram, then the combos. */
export function PrintView({ config, layout, onClose }: PrintViewProps) {
  const { keymap } = config;
  const [hiddenLayers, setHiddenLayers] = useState<ReadonlySet<number>>(new Set());
  const [showCombos, setShowCombos] = useState(true);
  const combos = useMemo(() => comboRows(keymap), [keymap]);
  const name = config.hardware?.displayName ?? findKeyboard(config.keyboard)?.name ?? config.keyboard;
  const layerName = (i: number) => keymap.layers[i]?.displayName ?? keymap.layers[i]?.name ?? `Layer ${i}`;

  const toggleLayer = (index: number) => {
    const next = new Set(hiddenLayers);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setHiddenLayers(next);
  };

  return (
    <div className="print-view">
      <div className="print-controls">
        <h2 className="panel-title">Print keymap</h2>
        <p className="muted small">
          Choose what to include, then press Print. In the print dialog, choose “Save as PDF” to get a file instead.
        </p>
        <fieldset className="fieldset">
          <legend>Layers</legend>
          {keymap.layers.map((layer, i) => (
            <label key={layer.name} className="check">
              <input type="checkbox" checked={!hiddenLayers.has(i)} onChange={() => toggleLayer(i)} />
              {i} · {layerName(i)}
            </label>
          ))}
        </fieldset>
        {combos.length > 0 && (
          <label className="check">
            <input type="checkbox" checked={showCombos} onChange={(e) => setShowCombos(e.target.checked)} />
            Combos ({combos.length})
          </label>
        )}
        <div className="row">
          <button type="button" className="button primary" onClick={() => window.print()}>
            Print
          </button>
          <button type="button" className="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <article className="print-sheet" aria-label="Cheat sheet">
        <header className="print-header">
          <h1>{name} keymap</h1>
          <p>Small text under a key: what it does when held, or what kind of key it is (mo = while held, tog = toggle, to = switch to).</p>
        </header>
        {keymap.layers.map((layer, i) =>
          hiddenLayers.has(i) ? null : (
            <section key={layer.name} className="print-layer" aria-label={`Layer ${i}: ${layerName(i)}`}>
              <h2>
                {i} · {layerName(i)}
              </h2>
              <KeyboardCanvas keymap={keymap} layout={layout} layer={i} selection={[]} onSelectKey={nothing} />
              <EncoderStrip keymap={keymap} layer={i} selected={null} onSelect={nothing} />
            </section>
          ),
        )}
        {showCombos && combos.length > 0 && (
          <section className="print-combos" aria-label="Combos">
            <h2>Combos</h2>
            <table>
              <thead>
                <tr>
                  <th scope="col">Press together</th>
                  <th scope="col">Sends</th>
                  <th scope="col">On</th>
                </tr>
              </thead>
              <tbody>
                {combos.map((combo) => (
                  <tr key={combo.name}>
                    <td>{combo.keys.join(' + ')}</td>
                    <td>{combo.sends}</td>
                    <td>{combo.layers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </article>
    </div>
  );
}
