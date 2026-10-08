import { useState, type ReactNode } from 'react';
import { interconnectOf, pinLabel } from '../../core/hardware/interconnects.ts';
import {
  clearDisplayPins,
  defaultDisplayPins,
  DISPLAY_KINDS,
  DISPLAYS,
  halfDisplay,
  halfDisplayPins,
  setDisplay,
} from '../../core/hardware/displays.ts';
import {
  drivenList,
  isShiftOutput,
  MAX_SHIFT_REGISTERS,
  outputCount,
  outputLabel,
  outputUses,
  setShiftOwnBus,
  setShiftRegisterCount,
  shiftPins,
} from '../../core/hardware/shiftRegisters.ts';
import type { DisplayKind, KeyboardHardware, LinePin, Pin, Side } from '../../core/hardware/types.ts';
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
import { ShiftRegisterPinout } from './ShiftRegisterPinout.tsx';

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
              <div className="wiring-pinouts">
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
                {side === undefined && (
                  <ShiftRegisterPinout
                    hw={hw}
                    label={active && active.side === undefined && active.list === drivenList(hw) ? active.label : undefined}
                    onPick={(output) => {
                      // Outputs only go on the lines shift registers drive.
                      if (!active || active.side !== undefined || active.list !== drivenList(hw)) return;
                      onChange(setPin(hw, undefined, active.list, active.index, { sr: output }));
                    }}
                  />
                )}
              </div>
            </div>
          </section>
        ))}
      </div>
      <fieldset className="fieldset">
        <legend>Displays</legend>
        <div className="display-halves">
          {(hw.split ? (['left', 'right'] as const) : [undefined]).map((side) => {
            const id = `display-${side ?? 'one'}`;
            const title = side === 'left' ? 'Left display' : side === 'right' ? 'Right display' : 'Display';
            const pins = halfDisplayPins(hw, side);
            const uses = pinUses(hw, side);
            return (
              <div key={id} className="display-half">
                <div className="field">
                  <label className="field-label" htmlFor={id}>
                    {title}
                  </label>
                  <select
                    id={id}
                    className="input"
                    aria-describedby="hw-display-help"
                    value={halfDisplay(hw, side) ?? ''}
                    onChange={(e) => {
                      onChange(setDisplay(hw, side, e.target.value === '' ? undefined : (e.target.value as DisplayKind)));
                      // An armed display pin field may belong to the display that just went away.
                      if (active?.list.startsWith('display.') && active.side === side) setActive(null);
                    }}
                  >
                    <option value="">None</option>
                    {DISPLAY_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {DISPLAYS[kind].label} ({defaultDisplayPins(kind, ic).map((p) => `D${p.pin}`).join(', ')})
                      </option>
                    ))}
                  </select>
                </div>
                {pins.length > 0 && (
                  <div className="pin-grid">
                    {pins.map(({ signal, pin, use }) => (
                      <div key={signal} className="field">
                        <PinSelect
                          hw={hw}
                          side={side}
                          list={`display.${signal}`}
                          index={0}
                          name={use}
                          label={`${title} ${use.slice('Display '.length)}`}
                          pin={pin}
                          uses={uses}
                          active={active}
                          onChange={onChange}
                          onActivate={setActive}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {hw.displayPins?.[side === 'right' ? 'right' : 'left'] && (
                  <button
                    type="button"
                    className="link-button"
                    aria-label={`Use the standard pins for the ${side ? `${side} ` : ''}display`}
                    onClick={() => onChange(clearDisplayPins(hw, side))}
                  >
                    Use the standard pins
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p id="hw-display-help" className="muted small">
          A nice!view defaults to{' '}
          {ic.niceViewAdapter
            ? `D${ic.niceViewPins.cs} (CS), D${ic.niceViewPins.data} (data) and D${ic.niceViewPins.clock} (clock) through ZMK’s adapter; on other pins the shield sets up its own SPI bus and builds without the adapter.`
            : `D${ic.niceViewPins.cs} (CS), D${ic.niceViewPins.data} (data) and D${ic.niceViewPins.clock} (clock); the shield sets up its SPI bus itself, without ZMK’s adapter.`}{' '}
          An OLED defaults to D{ic.i2cPins.sda} (SDA) and D{ic.i2cPins.scl} (SCL). Display pins can’t also be used for rows, columns or
          encoders on that half.
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
  const lists: { list: PinList; title: string; item: string; pins: LinePin[] }[] =
    hw.wiring.kind === 'direct'
      ? [{ list: 'pins', title: 'Inputs (one per key)', item: 'Input', pins: directPins(hw.wiring, side) }]
      : [
          { list: 'rows', title: 'Rows', item: 'Row', pins: matrixPins(hw.wiring, side).rows },
          { list: 'cols', title: 'Columns', item: 'Column', pins: matrixPins(hw.wiring, side).cols },
        ];
  const uses = pinUses(hw, side);
  const field = (list: PinList, index: number, name: string, pin: LinePin) => (
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
      {!hw.split && hw.wiring.kind === 'matrix' && <ShiftRegisterFields hw={hw} field={field} onChange={onChange} />}
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
  pin: LinePin;
  uses: Map<number, string[]>;
  active: Slot | null;
  onChange: (hw: KeyboardHardware) => void;
  onActivate: (slot: Slot) => void;
}) {
  const id = `pin-${side ?? 'one'}-${list}-${index}`;
  const isActive = active !== null && active.side === side && active.list === list && active.index === index;
  const { pins } = interconnectOf(hw.controller);
  // Driven matrix lines on a one-piece keyboard can also use the shift registers' outputs.
  const driven = !hw.split && list === drivenList(hw);
  const outputs = driven ? outputCount(hw) : 0;
  const outUses = outputs > 0 || isShiftOutput(pin) ? outputUses(hw) : new Map<number, string[]>();
  const value = isShiftOutput(pin) ? `sr:${pin.sr}` : (pin ?? '');
  const parse = (v: string): LinePin => (v === '' ? null : v.startsWith('sr:') ? { sr: Number(v.slice(3)) } : Number(v));
  return (
    <>
      <label className="field-label" htmlFor={id}>{label}</label>
      <select
        id={id}
        className={`input${isActive ? ' active-pin' : ''}`}
        value={value}
        onPointerDown={() => onActivate({ side, list, index, label })}
        onChange={(e) => onChange(setPin(hw, side, list, index, parse(e.target.value)))}
      >
        <option value="">No pin</option>
        {pin !== null && !isShiftOutput(pin) && !pins.includes(pin) && <option value={pin}>{pinLabel(pin)} (not on this controller)</option>}
        {isShiftOutput(pin) && pin.sr >= outputs && <option value={value}>{outputLabel(pin.sr)} (not available)</option>}
        {pins.map((p) => {
          const other = (uses.get(p) ?? []).filter((use) => use !== name);
          return (
            <option key={p} value={p}>
              {pinLabel(p)}
              {other.length > 0 ? ` (${other.join(', ')})` : ''}
            </option>
          );
        })}
        {outputs > 0 && (
          <optgroup label="Shift register outputs">
            {Array.from({ length: outputs }, (_, n) => {
              const other = (outUses.get(n) ?? []).filter((use) => use !== name);
              return (
                <option key={`sr${n}`} value={`sr:${n}`}>
                  {outputLabel(n)}
                  {other.length > 0 ? ` (${other.join(', ')})` : ''}
                </option>
              );
            })}
          </optgroup>
        )}
      </select>
    </>
  );
}

/** The 74HC595 chain: how many, and the latch, data and clock pins (shared with a nice!view unless on their own pins). */
function ShiftRegisterFields({
  hw,
  field,
  onChange,
}: {
  hw: KeyboardHardware;
  field: (list: PinList, index: number, name: string, pin: Pin) => ReactNode;
  onChange: (hw: KeyboardHardware) => void;
}) {
  const pins = shiftPins(hw);
  const niceView = halfDisplay(hw, undefined) === 'nice_view';
  return (
    <fieldset className="fieldset" aria-label="Shift registers">
      <legend>Shift registers</legend>
      <div className="field">
        <label className="field-label" htmlFor="shift-count">Number of shift registers</label>
        <select id="shift-count" className="input" value={hw.shiftRegisters?.count ?? 0} onChange={(e) => onChange(setShiftRegisterCount(hw, Number(e.target.value)))}>
          <option value={0}>None</option>
          {Array.from({ length: MAX_SHIFT_REGISTERS }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} ({n * 8} outputs)
            </option>
          ))}
        </select>
      </div>
      {pins && (
        <>
          <p className="muted small">
            Latch is the 595’s RCLK pin, data its SER and clock its SRCLK. U1 is the 595 wired to the controller; each one’s QH′ goes to the next one’s SER.
          </p>
          {niceView && (
            <label className="field checkbox">
              <input type="checkbox" checked={Boolean(hw.shiftRegisters?.ownBus)} onChange={(e) => onChange(setShiftOwnBus(hw, e.target.checked))} />
              <span>Shift registers on their own pins</span>
            </label>
          )}
          <div className="pin-grid">
            <div className="field">{field('shift.latch', 0, 'Shift register latch', pins.latch)}</div>
            {pins.shared ? (
              <>
                <div className="field">
                  <span className="field-label">Shift register data</span>
                  <p className="muted small">Shared with the nice!view (D{pins.data})</p>
                </div>
                <div className="field">
                  <span className="field-label">Shift register clock</span>
                  <p className="muted small">Shared with the nice!view (D{pins.clock})</p>
                </div>
              </>
            ) : (
              <>
                <div className="field">{field('shift.data', 0, 'Shift register data', pins.data)}</div>
                <div className="field">{field('shift.clock', 0, 'Shift register clock', pins.clock)}</div>
              </>
            )}
          </div>
        </>
      )}
    </fieldset>
  );
}
