import { useState, type ReactNode } from 'react';
import { halfLeds, LED_USES, MAX_LEDS, setBacklight, setLedCount, setUnderglow } from '../../core/hardware/leds.ts';
import type { KeyboardHardware, Pin, Side } from '../../core/hardware/types.ts';
import type { PinList } from '../../core/hardware/wiring.ts';
import { Switch } from './ui/Switch.tsx';

interface Props {
  hw: KeyboardHardware;
  side?: Side;
  /** Renders a pin card, as the other pin fields do. */
  field: (list: PinList, index: number, name: string, pin: Pin, label?: string) => ReactNode;
  onChange: (hw: KeyboardHardware) => void;
}

/** A half's LEDs: RGB underglow (data pin and count), a single-colour backlight, and an optional power switch. */
export function LedFields({ hw, side, field, onChange }: Props) {
  const leds = halfLeds(hw, side);
  const half = side === 'left' ? 'Left ' : side === 'right' ? 'Right ' : '';
  // "Left LED data", "Left backlight": the half's name in front, as other fields have it.
  const named = (name: string) => (half ? `${half}${name.startsWith('LED') ? name : name.toLowerCase()}` : name);
  const countId = `led-count-${side ?? 'one'}`;
  // What's being typed, so the field can be emptied before typing a new number.
  const [draft, setDraft] = useState<string | null>(null);
  const underglow = leds?.underglow;
  const backlight = leds?.backlight;
  return (
    <fieldset className="fieldset" aria-label={`${half}LEDs`}>
      <legend>LEDs</legend>
      <label className="field checkbox">
        <Switch checked={underglow !== undefined} onChange={(on) => onChange(setUnderglow(hw, side, on))} />
        <span>RGB underglow</span>
      </label>
      {underglow && (
        <div className="pin-grid">
          {field('led.data', 0, LED_USES.data, underglow.data, named('LED data'))}
          <div className="field pin-card plain">
            <label className="field-label" htmlFor={countId}>
              {named('Number of LEDs')}
            </label>
            <input
              id={countId}
              className="input"
              type="number"
              min={1}
              max={MAX_LEDS}
              value={draft ?? String(underglow.count)}
              onChange={(e) => {
                setDraft(e.target.value);
                const n = Number(e.target.value);
                if (e.target.value !== '' && Number.isInteger(n) && n >= 1 && n <= MAX_LEDS) onChange(setLedCount(hw, side, n));
              }}
              onBlur={() => setDraft(null)}
            />
          </div>
        </div>
      )}
      <label className="field checkbox">
        <Switch checked={backlight !== undefined} onChange={(on) => onChange(setBacklight(hw, side, on))} />
        <span>Backlight</span>
      </label>
      {backlight && <div className="pin-grid">{field('led.backlight', 0, LED_USES.backlight, backlight.pin, named('Backlight pin'))}</div>}
      {leds && (
        <>
          <div className="pin-grid">{field('led.power', 0, LED_USES.power, leds.power ?? null, named('LED power'))}</div>
          <p className="muted small">
            Optional: a load switch or MOSFET that cuts the LEDs’ power. ZMK’s external power then switches it, and the board’s own 3.3 V pin stays on.
          </p>
        </>
      )}
      {hw.split && side === 'left' && hw.wiring.right === undefined && leds && <p className="muted small">The right half gets the same LEDs.</p>}
    </fieldset>
  );
}
