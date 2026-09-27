import { useState } from 'react';
import { addKey, deleteKey } from '../../core/hardware/keys.ts';
import { hardwareLayout, type HardwareKey, type KeyboardHardware, type Side } from '../../core/hardware/types.ts';
import type { HardwareIssue } from '../../core/hardware/validate.ts';
import { DesignerCanvas, LiveNumberField, RotationField, UnitField } from './DesignerCanvas.tsx';
import type { HardwareDraft } from './HardwareWizard.tsx';
import { HardwareIssueList } from './HardwareIssueList.tsx';

interface Props {
  draft: HardwareDraft;
  issues: HardwareIssue[];
  onChange: (draft: HardwareDraft) => void;
}

export function HardwareLayoutStep({ draft, issues, onChange }: Props) {
  const { hw } = draft;
  const [selected, setSelected] = useState<number | null>(null);
  const direct = hw.wiring.kind === 'direct';
  const labels = hw.keys.map((k) => (direct ? `in ${k.col}` : `${k.row},${k.col}`));
  const flagged = new Set(issues.filter((i) => i.level === 'error').flatMap((i) => i.keys ?? []));
  const setHw = (next: KeyboardHardware) => onChange({ ...draft, hw: next });
  const updateKey = (index: number, patch: Partial<HardwareKey>) =>
    setHw({ ...hw, keys: hw.keys.map((k, i) => (i === index ? { ...k, ...patch } : k)) });
  const add = (side?: Side) => {
    onChange({ hw: addKey(hw, side), origins: [...draft.origins, undefined] });
    setSelected(hw.keys.length);
  };
  const remove = (index: number) => {
    onChange({ hw: deleteKey(hw, index), origins: draft.origins.filter((_, i) => i !== index) });
    setSelected(null);
  };
  const key = selected === null ? undefined : hw.keys[selected];

  return (
    <div className="designer">
      <div className="designer-main">
        <p className="muted small">
          Drag keys to where they are on your keyboard (arrows nudge, Shift: 1 key). Each key shows its matrix
          {direct ? ' input' : ' row,column'}; select one to change it. Keys are numbered in keymap order.
        </p>
        <DesignerCanvas
          layout={hardwareLayout(hw)}
          labels={labels}
          selected={selected}
          flagged={flagged}
          onSelect={setSelected}
          onChange={(layout) => setHw({ ...hw, keys: hw.keys.map((k, i) => ({ ...k, ...layout.keys[i] })) })}
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
        </div>
        {key && selected !== null ? (
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
            <button type="button" className="button danger" onClick={() => remove(selected)}>Delete key</button>
          </fieldset>
        ) : (
          <p className="muted small">Select a key to edit it.</p>
        )}
      </aside>
    </div>
  );
}
