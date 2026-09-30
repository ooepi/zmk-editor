import { useState } from 'react';
import { interconnectOf, pinLabel } from '../../core/hardware/interconnects.ts';
import { availableDisplays, DISPLAYS, displayPins, halfDisplay, setDisplay } from '../../core/hardware/displays.ts';
import type { DisplayKind, KeyboardHardware, Pin, Side } from '../../core/hardware/types.ts';
import type { HardwareIssue } from '../../core/hardware/validate.ts';
import {
  directInputUsed,
  directPins,
  halfEncoders,
  matrixPins,
  pinUses,
  removeDirectPin,
  setPin,
  setRightWiredDifferently,
  type PinList,
} from '../../core/hardware/wiring.ts';
import { HardwareIssueList } from './HardwareIssueList.tsx';
import { ControllerPinout } from './ControllerPinout.tsx';

interface Slot {
  side?: Side;
  list: PinList;
  index: number;
  /** What the field is called, e.g. "Left row 0", shown while it's picking a pin. */
  label: string;
}

interface Props {
  hw: KeyboardHardware;
  issues: HardwareIssue[];
  onChange: (hw: KeyboardHardware) => void;
  onAddEncoder: (side?: Side) => void;
  onRemoveEncoder: (side: Side | undefined, index: number) => void;
}

export function HardwareWiringStep({ hw, issues, onChange, onAddEncoder, onRemoveEncoder }: Props) {
  const [active, setActive] = useState<Slot | null>(null);
  const differently = hw.wiring.right !== undefined;
  const shown: (Side | undefined)[] = hw.split ? (differently ? ['left', 'right'] : ['left']) : [undefined];
  const ic = interconnectOf(hw.controller);
  /** The displays this controller takes, plus one already chosen that it can't take, so it stays visible (and flagged). */
  const displayChoices = (current: DisplayKind | undefined) => {
    const available = availableDisplays(ic);
    return current && !available.includes(current) ? [current, ...available] : available;
  };
  const title = (side: Side | undefined) =>
    side === 'right' ? 'Right half' : side === 'left' ? (differently ? 'Left half' : 'Left half (the right half mirrors it)') : undefined;
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
            <input
              type="checkbox"
              checked={differently}
              onChange={(e) => {
                onChange(setRightWiredDifferently(hw, e.target.checked));
                // The active field may no longer make sense (e.g. it was a right-half field that just went away).
                setActive(null);
              }}
            />
            <span>The right half is wired differently</span>
          </label>
        )}
        {hw.split && !differently && (
          <p className="muted small">
            The right half is wired as a mirror image of the left, like a reversible PCB: the same pins, with the outer
            columns sharing a pin.
          </p>
        )}
      </div>
      <div className={`wiring-halves${shown.length > 1 ? ' two' : ''}`}>
        {shown.map((side) => (
          <section key={side ?? 'one'} className={`wiring-half${side === 'right' ? ' right' : ''}`} aria-label={title(side) ?? 'Pins'}>
            {side && <h3 className="wiring-half-title">{title(side)}</h3>}
            <div className="wiring-half-body">
              <div className="wiring-tables">
                <PinTables
                  hw={hw}
                  side={side}
                  active={active}
                  onChange={onChange}
                  onActivate={setActive}
                  onAddEncoder={onAddEncoder}
                  onRemoveEncoder={onRemoveEncoder}
                />
              </div>
              <ControllerPinout
                hw={hw}
                side={side}
                label={active && active.side === side ? active.label : undefined}
                onPick={(pin) => {
                  // Each pinout fills fields of its own half only.
                  if (!active || active.side !== side) return;
                  // Stale after "wired differently" was just unticked: don't quietly bring the right half's own pins back.
                  if (active.side === 'right' && hw.wiring.right === undefined) return;
                  onChange(setPin(hw, active.side, active.list, active.index, pin));
                }}
              />
            </div>
          </section>
        ))}
      </div>
      <fieldset className="fieldset">
        <legend>Displays</legend>
        <div className="pin-grid">
          {(hw.split ? (['left', 'right'] as const) : [undefined]).map((side) => {
            const id = `display-${side ?? 'one'}`;
            return (
              <div key={id} className="field">
                <label className="field-label" htmlFor={id}>
                  {side === 'left' ? 'Left display' : side === 'right' ? 'Right display' : 'Display'}
                </label>
                <select
                  id={id}
                  className="input"
                  aria-describedby="hw-display-help"
                  value={halfDisplay(hw, side) ?? ''}
                  onChange={(e) => onChange(setDisplay(hw, side, e.target.value === '' ? undefined : (e.target.value as DisplayKind)))}
                >
                  <option value="">None</option>
                  {displayChoices(halfDisplay(hw, side)).map((kind) => (
                    <option key={kind} value={kind}>
                      {DISPLAYS[kind].label} ({displayPins(kind, ic).map((p) => `D${p.pin}`).join(', ')})
                      {availableDisplays(ic).includes(kind) ? '' : ' (not on this controller)'}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <p id="hw-display-help" className="muted small">
          {ic.niceViewAdapter
            ? `Displays use fixed pins: a nice!view D1, D2 and D3, an OLED D${ic.i2cPins.sda} (SDA) and D${ic.i2cPins.scl} (SCL). They can’t be used for rows, columns or encoders on that half.`
            : `OLEDs use D${ic.i2cPins.sda} (SDA) and D${ic.i2cPins.scl} (SCL), which can’t then be used for rows, columns or encoders on that half. A nice!view on a ${ic.name} isn’t supported yet.`}
        </p>
      </fieldset>
      <HardwareIssueList issues={issues} />
    </div>
  );
}

interface PinTablesProps {
  hw: KeyboardHardware;
  side?: Side;
  active: Slot | null;
  onChange: (hw: KeyboardHardware) => void;
  onActivate: (slot: Slot) => void;
  onAddEncoder: (side?: Side) => void;
  onRemoveEncoder: (side: Side | undefined, index: number) => void;
}

function PinTables({ hw, side, active, onChange, onActivate, onAddEncoder, onRemoveEncoder }: PinTablesProps) {
  const prefix = side === 'left' ? 'Left ' : side === 'right' ? 'Right ' : '';
  const lists: { list: PinList; title: string; item: string; pins: Pin[] }[] =
    hw.wiring.kind === 'direct'
      ? [{ list: 'pins', title: 'Inputs (one per key)', item: 'Input', pins: directPins(hw.wiring, side) }]
      : [
          { list: 'rows', title: 'Rows', item: 'Row', pins: matrixPins(hw.wiring, side).rows },
          { list: 'cols', title: 'Columns', item: 'Column', pins: matrixPins(hw.wiring, side).cols },
        ];
  const uses = pinUses(hw, side);
  const field = (list: PinList, index: number, name: string, pin: Pin) => (
    <PinSelect
      hw={hw}
      side={side}
      list={list}
      index={index}
      name={name}
      label={prefix ? `${prefix}${name.charAt(0).toLowerCase()}${name.slice(1)}` : name}
      pin={pin}
      uses={uses}
      active={active}
      onChange={onChange}
      onActivate={onActivate}
    />
  );
  const encoders = halfEncoders(hw, side);
  return (
    <>
      {lists.map(({ list, title, item, pins }) => (
        <fieldset key={list} className="fieldset">
          <legend>{title}</legend>
          <div className="pin-grid">
            {pins.map((pin, index) => (
              <div key={index} className="field">
                {field(list, index, `${item} ${index}`, pin)}
                {list === 'pins' && !directInputUsed(hw, side, index) && (
                  <button type="button" className="link-button" onClick={() => onChange(removeDirectPin(hw, side, index))}>
                    Remove unused input
                  </button>
                )}
              </div>
            ))}
          </div>
        </fieldset>
      ))}
      <fieldset className="fieldset">
        <legend>Encoders</legend>
        {encoders.length === 0 && <p className="muted small">No encoders. Most keyboards have none, one or two per half.</p>}
        {encoders.map((encoder, index) => (
          <div key={index} className="encoder-pins">
            <div className="field">{field('encoderA', index, `Encoder ${index} A`, encoder.a)}</div>
            <div className="field">{field('encoderB', index, `Encoder ${index} B`, encoder.b)}</div>
            <button type="button" className="link-button" onClick={() => onRemoveEncoder(side, index)}>
              Remove encoder {index}
            </button>
          </div>
        ))}
        {hw.split && side === 'left' && hw.wiring.right === undefined && encoders.length > 0 && (
          <p className="muted small">The right half gets the same encoders, with A and B swapped so both turn the same way.</p>
        )}
        <div className="row">
          <button type="button" className="button" onClick={() => onAddEncoder(side)}>
            Add encoder
          </button>
        </div>
      </fieldset>
    </>
  );
}

/** A pin field: a select of the controller's pins that also arms the pinout for this field when pressed. */
function PinSelect({
  hw,
  side,
  list,
  index,
  name,
  label,
  pin,
  uses,
  active,
  onChange,
  onActivate,
}: {
  hw: KeyboardHardware;
  side?: Side;
  list: PinList;
  index: number;
  /** The field's name in pin uses, e.g. "Row 0". */
  name: string;
  /** The visible label, e.g. "Left row 0". */
  label: string;
  pin: Pin;
  uses: Map<number, string[]>;
  active: Slot | null;
  onChange: (hw: KeyboardHardware) => void;
  onActivate: (slot: Slot) => void;
}) {
  const id = `pin-${side ?? 'one'}-${list}-${index}`;
  const isActive = active !== null && active.side === side && active.list === list && active.index === index;
  const { pins } = interconnectOf(hw.controller);
  return (
    <>
      <label className="field-label" htmlFor={id}>{label}</label>
      <select
        id={id}
        className={`input${isActive ? ' active-pin' : ''}`}
        value={pin ?? ''}
        onPointerDown={() => onActivate({ side, list, index, label })}
        onChange={(e) => onChange(setPin(hw, side, list, index, e.target.value === '' ? null : Number(e.target.value)))}
      >
        <option value="">No pin</option>
        {/* A pin this controller doesn't have (it changed) stays selected until it's changed; validation flags it. */}
        {pin !== null && !pins.includes(pin) && <option value={pin}>{pinLabel(pin)} (not on this controller)</option>}
        {pins.map((p) => {
          const other = (uses.get(p) ?? []).filter((use) => use !== name);
          return (
            <option key={p} value={p}>
              {pinLabel(p)}
              {other.length > 0 ? ` (${other.join(', ')})` : ''}
            </option>
          );
        })}
      </select>
    </>
  );
}
