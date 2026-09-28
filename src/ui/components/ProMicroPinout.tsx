import { isNiceNano, PRO_MICRO_HEADER, type HeaderPad } from '../../core/hardware/controllers.ts';
import type { KeyboardHardware, Side } from '../../core/hardware/types.ts';
import { pinUses } from '../../core/hardware/wiring.ts';
import { setPreferences, usePreferences } from '../state/preferences.ts';

interface Props {
  hw: KeyboardHardware;
  side?: Side;
  /** The field a pin click will fill in, e.g. "Input 1"; none picked when undefined. */
  label?: string;
  onPick: (pin: number) => void;
}

/**
 * The Pro Micro seen from above or below; each pin shows what it's used for.
 * Clicking one fills the selected field. From below the pin columns swap
 * sides (USB stays at the top), matching wiring plans drawn from underneath.
 */
export function ProMicroPinout({ hw, side, label, onPick }: Props) {
  const { pinoutViews } = usePreferences();
  const viewKey = side ?? 'one';
  const view = pinoutViews[viewKey] ?? 'top';
  const setView = (next: 'top' | 'bottom') => setPreferences({ pinoutViews: { ...pinoutViews, [viewKey]: next } });
  const uses = pinUses(hw, side);
  const nice = isNiceNano(hw.controller);
  const column = (pads: HeaderPad[], edge: 'left' | 'right') => (
    <ul className={`pinout-column ${edge}`}>
      {pads.map((pad, i) => {
        const pin = pad.pin;
        if (pin === null) {
          return (
            <li key={i}>
              <span className="pinout-pad power">{pad.label}</span>
            </li>
          );
        }
        const use = uses.get(pin)?.join(', ');
        return (
          <li key={i}>
            <button type="button" className={`pinout-pad${use ? ' used' : ''}`} aria-label={use ? `${pad.label}: ${use}` : pad.label} onClick={() => onPick(pin)}>
              <span className="pinout-label">{pad.label}</span>
              {nice && <span className="pinout-sub">{pad.niceNano}</span>}
              {use && <span className="pinout-use">{use}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
  return (
    <figure className="pinout" aria-label={`Pro Micro pinout${side ? ` (${side} half)` : ''}`}>
      <figcaption className="muted small">
        Pins seen from {view === 'top' ? 'above' : 'below'}, USB at the top{side ? ` (${side} half)` : ''}.{' '}
        {label ? `Picking a pin for ${label}.` : 'Click a pin field, then a pin.'}
      </figcaption>
      <div className="pinout-view" role="group" aria-label="Seen from">
        <span className="muted small">Seen from</span>
        {(['top', 'bottom'] as const).map((v) => (
          <button key={v} type="button" className={`chip${view === v ? ' active' : ''}`} aria-pressed={view === v} onClick={() => setView(v)}>
            {v === 'top' ? 'Top' : 'Bottom'}
          </button>
        ))}
      </div>
      <div className="pinout-board">
        {column(view === 'top' ? PRO_MICRO_HEADER.left : PRO_MICRO_HEADER.right, 'left')}
        <div className="pinout-usb" aria-hidden="true">USB</div>
        {column(view === 'top' ? PRO_MICRO_HEADER.right : PRO_MICRO_HEADER.left, 'right')}
      </div>
    </figure>
  );
}
