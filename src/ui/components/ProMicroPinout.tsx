import { isNiceNano, PRO_MICRO_HEADER, type HeaderPad } from '../../core/hardware/controllers.ts';
import type { KeyboardHardware, Side } from '../../core/hardware/types.ts';
import { pinUses } from '../../core/hardware/wiring.ts';

interface Props {
  hw: KeyboardHardware;
  side?: Side;
  onPick: (pin: number) => void;
}

/** The Pro Micro seen from above; each pin shows what it's used for. Clicking one fills the selected field. */
export function ProMicroPinout({ hw, side, onPick }: Props) {
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
    <figure className="pinout" aria-label="Pro Micro pinout">
      <figcaption className="muted small">
        Pins seen from above, USB at the top{side ? ` (${side} half)` : ''}. Select a field, then click a pin.
      </figcaption>
      <div className="pinout-board">
        {column(PRO_MICRO_HEADER.left, 'left')}
        <div className="pinout-usb" aria-hidden="true">USB</div>
        {column(PRO_MICRO_HEADER.right, 'right')}
      </div>
    </figure>
  );
}
