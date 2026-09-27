import { useState } from 'react';
import { PRO_MICRO_PINS, pinLabel } from '../../core/hardware/controllers.ts';
import type { KeyboardHardware, Pin, Side } from '../../core/hardware/types.ts';
import type { HardwareIssue } from '../../core/hardware/validate.ts';
import {
  directInputUsed,
  directPins,
  matrixPins,
  pinUses,
  removeDirectPin,
  setPin,
  setRightWiredDifferently,
  type PinList,
} from '../../core/hardware/wiring.ts';
import { HardwareIssueList } from './HardwareIssueList.tsx';
import { ProMicroPinout } from './ProMicroPinout.tsx';

interface Slot {
  side?: Side;
  list: PinList;
  index: number;
}

interface Props {
  hw: KeyboardHardware;
  issues: HardwareIssue[];
  onChange: (hw: KeyboardHardware) => void;
}

export function HardwareWiringStep({ hw, issues, onChange }: Props) {
  const [active, setActive] = useState<Slot | null>(null);
  const differently = hw.wiring.right !== undefined;
  const shown: (Side | undefined)[] = hw.split ? (differently ? ['left', 'right'] : ['left']) : [undefined];
  return (
    <div className="wiring-step">
      <div className="stack">
        <p className="muted small">
          {hw.wiring.kind === 'direct'
            ? 'Each key connects its pin to ground; no diodes are needed. Pick the pin each key is soldered to.'
            : 'Pick the controller pin each row and column wire is soldered to.'}
        </p>
        {hw.split && (
          <label className="field checkbox">
            <input type="checkbox" checked={differently} onChange={(e) => onChange(setRightWiredDifferently(hw, e.target.checked))} />
            <span>The right half is wired differently</span>
          </label>
        )}
        {hw.split && !differently && (
          <p className="muted small">
            The right half is wired as a mirror image of the left, like a reversible PCB: the same pins, with the outer
            columns sharing a pin.
          </p>
        )}
        {shown.map((side) => (
          <PinTables key={side ?? 'one'} hw={hw} side={side} onChange={onChange} onFocusSlot={setActive} />
        ))}
        <HardwareIssueList issues={issues} />
      </div>
      <ProMicroPinout hw={hw} side={active?.side} onPick={(pin) => active && onChange(setPin(hw, active.side, active.list, active.index, pin))} />
    </div>
  );
}

function PinTables({ hw, side, onChange, onFocusSlot }: { hw: KeyboardHardware; side?: Side; onChange: (hw: KeyboardHardware) => void; onFocusSlot: (slot: Slot) => void }) {
  const prefix = side === 'left' ? 'Left ' : side === 'right' ? 'Right ' : '';
  const lists: { list: PinList; title: string; item: string; pins: Pin[] }[] =
    hw.wiring.kind === 'direct'
      ? [{ list: 'pins', title: 'Inputs (one per key)', item: 'Input', pins: directPins(hw.wiring, side) }]
      : [
          { list: 'rows', title: 'Rows', item: 'Row', pins: matrixPins(hw.wiring, side).rows },
          { list: 'cols', title: 'Columns', item: 'Column', pins: matrixPins(hw.wiring, side).cols },
        ];
  const uses = pinUses(hw, side);
  return (
    <>
      {lists.map(({ list, title, item, pins }) => (
        <fieldset key={list} className="fieldset">
          <legend>{side ? `${prefix}half · ${title}` : title}</legend>
          <div className="pin-grid">
            {pins.map((pin, index) => {
              const id = `pin-${side ?? 'one'}-${list}-${index}`;
              const name = `${item} ${index}`;
              const label = prefix ? `${prefix}${name.toLowerCase()}` : name;
              return (
                <div key={index} className="field">
                  <label className="field-label" htmlFor={id}>{label}</label>
                  <select
                    id={id}
                    className="input"
                    value={pin ?? ''}
                    onFocus={() => onFocusSlot({ side, list, index })}
                    onChange={(e) => onChange(setPin(hw, side, list, index, e.target.value === '' ? null : Number(e.target.value)))}
                  >
                    <option value="">No pin</option>
                    {PRO_MICRO_PINS.map((p) => {
                      const other = (uses.get(p) ?? []).filter((use) => use !== name);
                      return (
                        <option key={p} value={p}>
                          {pinLabel(p)}
                          {other.length > 0 ? ` (${other.join(', ')})` : ''}
                        </option>
                      );
                    })}
                  </select>
                  {list === 'pins' && !directInputUsed(hw, side, index) && (
                    <button type="button" className="link-button" onClick={() => onChange(removeDirectPin(hw, side, index))}>
                      Remove unused input
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </>
  );
}
