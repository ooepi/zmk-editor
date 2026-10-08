import { HARDWARE_CONTROLLERS } from '../../core/hardware/controllers.ts';
import { INTERCONNECTS, interconnectOf } from '../../core/hardware/interconnects.ts';
import { hardwareName, type HardwareBasics } from '../../core/hardware/grid.ts';
import type { HardwareIssue } from '../../core/hardware/validate.ts';
import { HardwareIssueList } from './HardwareIssueList.tsx';
import { Switch } from './ui/Switch.tsx';

interface Props {
  basics: HardwareBasics;
  /** Editing an existing keyboard: the id, split and wiring kind are fixed. */
  editing: boolean;
  issues: HardwareIssue[];
  onChange: (basics: HardwareBasics) => void;
}

export function HardwareBasicsStep({ basics, editing, issues, onChange }: Props) {
  const set = (patch: Partial<HardwareBasics>) => onChange({ ...basics, ...patch });
  // The id follows the name until it no longer matches what the name would derive (edited by hand, or fixed while editing).
  const idEdited = editing || basics.name !== hardwareName(basics.displayName);
  const sizeFixed = editing && basics.wiring === 'direct';
  return (
    <div className="stack">
      <div className="field">
        <label className="field-label" htmlFor="hw-name">Keyboard name</label>
        <input
          id="hw-name"
          className="input"
          aria-describedby="hw-name-help"
          value={basics.displayName}
          onChange={(e) => set({ displayName: e.target.value, ...(idEdited ? {} : { name: hardwareName(e.target.value) }) })}
        />
        <p id="hw-name-help" className="muted small">Shown in the editor and as the Bluetooth name (at most 16 characters).</p>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="hw-id">Id</label>
        <input
          id="hw-id"
          className="input mono"
          aria-describedby="hw-id-help"
          value={basics.name}
          disabled={editing}
          onChange={(e) => set({ name: e.target.value })}
        />
        <p id="hw-id-help" className="muted small">
          Names the files: config/boards/shields/{basics.name}/ and config/{basics.name}.keymap.
          {editing && ' It can’t change once the keyboard exists.'}
        </p>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="hw-controller">Controller</label>
        <select id="hw-controller" className="input" value={basics.controller} onChange={(e) => set({ controller: e.target.value })}>
          {INTERCONNECTS.map((ic) => {
            const controllers = HARDWARE_CONTROLLERS.filter((c) => interconnectOf(c.id) === ic);
            return controllers.length === 0 ? null : (
              <optgroup key={ic.id} label={`${ic.name} footprint`}>
                {controllers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>
      <label className="field checkbox">
        <Switch checked={basics.split} disabled={editing} onChange={(split) => set({ split })} />
        <span>Split keyboard (two halves)</span>
      </label>
      <fieldset className="choice-cards">
        <legend className="field-label">Wiring</legend>
        <label className={`choice-card${basics.wiring === 'matrix' ? ' active' : ''}`}>
          <input type="radio" name="hw-wiring" checked={basics.wiring === 'matrix'} disabled={editing} onChange={() => set({ wiring: 'matrix' })} />
          <span>Matrix with diodes (rows × columns)</span>
        </label>
        <label className={`choice-card${basics.wiring === 'direct' ? ' active' : ''}`}>
          <input type="radio" name="hw-wiring" checked={basics.wiring === 'direct'} disabled={editing} onChange={() => set({ wiring: 'direct' })} />
          <span>Direct (one pin per key)</span>
        </label>
      </fieldset>
      {sizeFixed ? (
        <p className="muted small">
          {basics.cols} inputs{basics.split ? ' per half' : ''}. Add or remove keys on the Layout step.
        </p>
      ) : (
        <>
          <div className="field-grid">
            <div className="field">
              <label className="field-label" htmlFor="hw-rows">Rows</label>
              <input id="hw-rows" className="input" type="number" min={1} max={18} value={basics.rows} aria-describedby="hw-size-help" onChange={(e) => set({ rows: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="hw-cols">Columns</label>
              <input id="hw-cols" className="input" type="number" min={1} max={18} value={basics.cols} aria-describedby="hw-size-help" onChange={(e) => set({ cols: Number(e.target.value) })} />
            </div>
          </div>
          <p id="hw-size-help" className="muted small">
            {basics.split ? 'Per half. ' : ''}You can move, add and remove keys on the Layout step.
          </p>
        </>
      )}
      {basics.wiring === 'matrix' && (
        <div className="field">
          <label className="field-label" htmlFor="hw-diodes">Diode direction</label>
          <select id="hw-diodes" className="input" aria-describedby="hw-diodes-help" value={basics.diodeDirection} onChange={(e) => set({ diodeDirection: e.target.value === 'row2col' ? 'row2col' : 'col2row' })}>
            <option value="col2row">COL2ROW</option>
            <option value="row2col">ROW2COL</option>
          </select>
          <p id="hw-diodes-help" className="muted small">
            COL2ROW: each diode’s marked end (the black band) faces the row wire. ROW2COL: it faces the column wire. Most
            keyboards use COL2ROW.
          </p>
        </div>
      )}
      {basics.wiring === 'matrix' && !basics.split && (
        <div className="field">
          <label className="field-label" htmlFor="hw-shift">Shift registers (74HC595)</label>
          <select id="hw-shift" className="input" aria-describedby="hw-shift-help" value={basics.shiftRegisters} onChange={(e) => set({ shiftRegisters: Number(e.target.value) })}>
            <option value={0}>None</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n} ({n * 8} outputs)
              </option>
            ))}
          </select>
          <p id="hw-shift-help" className="muted small">
            For more {basics.diodeDirection === 'col2row' ? 'columns' : 'rows'} than the controller has pins: a chain of 74HC595 chips drives up to 32 of them from three pins.
          </p>
        </div>
      )}
      <HardwareIssueList issues={issues} />
    </div>
  );
}
