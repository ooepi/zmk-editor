import { useState } from 'react';
import { sensorOrder } from '../../core/hardware/encoders.ts';
import { addKey, deleteKeys, numberFromPositions } from '../../core/hardware/keys.ts';
import { hardwareLayout, type HardwareKey, type KeyboardHardware, type Side } from '../../core/hardware/types.ts';
import type { HardwareIssue } from '../../core/hardware/validate.ts';
import { DesignerCanvas, KnobFields, LiveNumberField, RotationField, UnitField } from './DesignerCanvas.tsx';
import { placeEncoders, setEncoderSpot } from '../../core/layouts/encoders.ts';
import type { EncoderSpot } from '../../core/layouts/types.ts';
import type { HardwareDraft } from './HardwareWizard.tsx';
import { HardwareIssueList } from './HardwareIssueList.tsx';

interface Props {
  draft: HardwareDraft;
  issues: HardwareIssue[];
  onChange: (draft: HardwareDraft) => void;
}

export function HardwareLayoutStep({ draft, issues, onChange }: Props) {
  const { hw } = draft;
  const [selection, setSelectionState] = useState<number[]>([]);
  /** The selected encoder knob; selecting keys clears it, and the other way round. */
  const [knob, setKnob] = useState<number | null>(null);
  const setSelection = (indices: number[]) => {
    setSelectionState(indices);
    if (indices.length > 0) setKnob(null);
  };
  const selectKnob = (index: number | null) => {
    setKnob(index);
    if (index !== null) setSelectionState([]);
  };
  const selected = selection.length === 1 ? (selection[0] ?? null) : null;
  const sensors = sensorOrder(hw);
  // Keys carry their half, so each knob's default spot is under the right keys.
  const knobs = placeEncoders({ name: hw.displayName, keys: hw.keys, ...(hw.encoderSpots ? { encoders: hw.encoderSpots } : {}) }, sensors.map((s) => s.side), sensors.length);
  const direct = hw.wiring.kind === 'direct';
  const labels = hw.keys.map((k) => (direct ? `in ${k.col}` : `${k.row},${k.col}`));
  const flagged = new Set(issues.filter((i) => i.level === 'error').flatMap((i) => i.keys ?? []));
  const setHw = (next: KeyboardHardware) => onChange({ ...draft, hw: next });
  const updateKey = (index: number, patch: Partial<HardwareKey>) =>
    setHw({ ...hw, keys: hw.keys.map((k, i) => (i === index ? { ...k, ...patch } : k)) });
  const updateKeys = (indices: number[], patch: Partial<HardwareKey>) => {
    const chosen = new Set(indices);
    setHw({ ...hw, keys: hw.keys.map((k, i) => (chosen.has(i) ? { ...k, ...patch } : k)) });
  };
  /** What every selected key has in common, or undefined when they differ. */
  const shared = <T,>(pick: (k: HardwareKey) => T): T | undefined => {
    const values = selection.map((i) => hw.keys[i]).filter((k): k is HardwareKey => !!k).map(pick);
    return values.length > 0 && values.every((v) => v === values[0]) ? values[0] : undefined;
  };
  const add = (side?: Side) => {
    onChange({ ...draft, hw: addKey(hw, side), origins: [...draft.origins, undefined] });
    setSelection([hw.keys.length]);
  };
  const remove = (indices: number[]) => {
    const gone = new Set(indices);
    onChange({ ...draft, hw: deleteKeys(hw, indices), origins: draft.origins.filter((_, i) => !gone.has(i)) });
    setSelection([]);
  };
  const key = selected === null ? undefined : hw.keys[selected];
  /** Moves one knob (null: back to its default spot); the others keep theirs. */
  const moveKnob = (index: number, spot: EncoderSpot | null) => {
    const { encoderSpots: _, ...rest } = hw;
    const encoderSpots = setEncoderSpot(hw.encoderSpots, index, spot, sensors.length);
    setHw(encoderSpots ? { ...rest, encoderSpots } : rest);
  };

  return (
    <div className="designer">
      <div className="designer-main">
        <p className="muted small">
          Drag keys to where they are on your keyboard (arrows nudge, Shift: 1 key). Ctrl/Shift-click or drag a box on an
          empty spot to select several keys and move them together. Each key shows its matrix
          {direct ? ' input' : ' row,column'}; select one to change it. Keys are numbered in keymap order.
        </p>
        {sensorOrder(hw).length > 0 && (
          <p className="muted small">
            An encoder’s push button is wired like any other switch: add a key for it here and give it a row and column.
          </p>
        )}
        <DesignerCanvas
          layout={hardwareLayout(hw)}
          labels={labels}
          selection={selection}
          flagged={flagged}
          onSelectionChange={setSelection}
          onDelete={remove}
          onChange={(layout) => setHw({ ...hw, keys: hw.keys.map((k, i) => ({ ...k, ...layout.keys[i] })) })}
          knobs={knobs}
          selectedKnob={knob}
          onSelectKnob={selectKnob}
          onMoveKnob={moveKnob}
        />
        <HardwareIssueList issues={issues} />
      </div>
      <aside className="designer-panel" aria-label="Key settings">
        <div className="row wrap">
          {hw.split ? (
            <>
              <button type="button" className="button" onClick={() => add('left')}>Add key (left)</button>
              <button type="button" className="button" onClick={() => add('right')}>Add key (right)</button>
            </>
          ) : (
            <button type="button" className="button" onClick={() => add()}>Add key</button>
          )}
          <button
            type="button"
            className="button"
            title={direct ? 'Inputs in reading order, per half' : 'Rows top to bottom, columns left to right, per half'}
            onClick={() => {
              const what = direct ? 'input' : 'row and column';
              if (window.confirm(`Number every key from where it sits? This replaces each key’s ${what}.`)) setHw(numberFromPositions(hw));
            }}
          >
            Number from positions
          </button>
        </div>
        {knob !== null && knobs[knob] ? (
          <KnobFields index={knob} spot={knobs[knob]} saved={!!hw.encoderSpots?.[knob]} onMove={(spot) => moveKnob(knob, spot)} />
        ) : key && selected !== null ? (
          <fieldset className="fieldset">
            <legend>Key {selected}</legend>
            <div className="field-grid">
              {direct ? (
                <LiveNumberField key={`c-${selected}`} label="Input" value={key.col} step={1} scale={1} min={0} onChange={(col) => updateKey(selected, { col })} />
              ) : (
                <>
                  <LiveNumberField key={`r-${selected}`} label="Row" value={key.row} step={1} scale={1} min={0} onChange={(row) => updateKey(selected, { row })} />
                  <LiveNumberField key={`c-${selected}`} label="Column" value={key.col} step={1} scale={1} min={0} onChange={(col) => updateKey(selected, { col })} />
                </>
              )}
              {hw.split && (
                <label className="field">
                  <span className="field-label">Half</span>
                  <select className="input" value={key.side ?? 'left'} onChange={(e) => updateKey(selected, { side: e.target.value === 'right' ? 'right' : 'left' })}>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </label>
              )}
              <UnitField key={`x-${selected}`} label="X" value={key.x} onChange={(x) => updateKey(selected, { x })} />
              <UnitField key={`y-${selected}`} label="Y" value={key.y} onChange={(y) => updateKey(selected, { y })} />
              <UnitField key={`w-${selected}`} label="Width" value={key.w} min={25} onChange={(w) => updateKey(selected, { w })} />
              <UnitField key={`h-${selected}`} label="Height" value={key.h} min={25} onChange={(h) => updateKey(selected, { h })} />
              <RotationField
                key={`rot-${selected}`}
                value={key.r}
                onChange={(r) => updateKey(selected, { r, ...(key.r === 0 && key.rx === 0 && key.ry === 0 ? { rx: key.x + key.w / 2, ry: key.y + key.h / 2 } : {}) })}
              />
            </div>
            <button type="button" className="button danger" onClick={() => remove([selected])}>Delete key</button>
          </fieldset>
        ) : selection.length > 1 ? (
          <div className="stack">
            <p className="muted small">
              {selection.length} keys selected. Drag them or use the arrow keys to move them together; Esc clears the selection.
              {!direct && ' Set a row or column here to put them all on it.'}
            </p>
            <div className="field-grid" key={selection.join(',')}>
              {!direct && (
                <>
                  <SharedNumberField label="Row" value={shared((k) => k.row)} onChange={(row) => updateKeys(selection, { row })} />
                  <SharedNumberField label="Column" value={shared((k) => k.col)} onChange={(col) => updateKeys(selection, { col })} />
                </>
              )}
              {hw.split && (
                <label className="field">
                  <span className="field-label">Half</span>
                  <select
                    className="input"
                    value={shared((k) => k.side ?? 'left') ?? ''}
                    onChange={(e) => updateKeys(selection, { side: e.target.value === 'right' ? 'right' : 'left' })}
                  >
                    <option value="" disabled hidden>
                      Mixed
                    </option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </label>
              )}
            </div>
            <button type="button" className="button danger" onClick={() => remove(selection)}>
              Delete {selection.length} keys
            </button>
          </div>
        ) : (
          <p className="muted small">Select a key to edit it.</p>
        )}
      </aside>
    </div>
  );
}

/**
 * A whole-number field for several keys at once: their shared value, or blank
 * when they differ. Every valid number applies to all of them as it's typed.
 */
function SharedNumberField({ label, value, onChange }: { label: string; value: number | undefined; onChange: (v: number) => void }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const [shown, setShown] = useState(value);
  // Follow changes made elsewhere, unless the text already says the same.
  if (value !== shown) {
    setShown(value);
    if (text.trim() === '' || Number(text) !== value) setText(value === undefined ? '' : String(value));
  }
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="input"
        type="number"
        min={0}
        step={1}
        value={text}
        placeholder={value === undefined ? 'Mixed' : undefined}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isInteger(v) && v >= 0) onChange(v);
        }}
      />
    </label>
  );
}
