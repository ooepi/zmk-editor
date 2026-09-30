import { interconnectOf, type HeaderPad } from '../../core/hardware/interconnects.ts';
import type { KeyboardHardware, Side } from '../../core/hardware/types.ts';
import { pinUses } from '../../core/hardware/wiring.ts';
import { setPreferences, usePreferences } from '../state/preferences.ts';

/** A pad's colour class from its uses: row (or direct input), column, encoder, display, free, or a clash. */
function useClass(uses: string[] | undefined): string {
  const [first = '', second] = uses ?? [];
  if (second !== undefined) return 'use-clash';
  if (first.startsWith('Row') || first.startsWith('Input')) return 'use-row';
  if (first.startsWith('Column')) return 'use-col';
  if (first.startsWith('Encoder')) return 'use-encoder';
  if (first.startsWith('Display')) return 'use-display';
  return 'use-free';
}

interface Props {
  hw: KeyboardHardware;
  side?: Side;
  /** The field a pin click will fill in, e.g. "Input 1"; none picked when undefined. */
  label?: string;
  onPick: (pin: number) => void;
}

/**
 * The controller seen from above or below; each pin shows what it's used for.
 * Its footprint (Pro Micro, Seeed XIAO) comes from the controller.
 * Clicking one fills the selected field. From below the pin columns swap
 * sides (USB stays at the top), matching wiring plans drawn from underneath.
 */
export function ControllerPinout({ hw, side, label, onPick }: Props) {
  const { pinoutViews } = usePreferences();
  const viewKey = side ?? 'one';
  const view = pinoutViews[viewKey] ?? 'top';
  const setView = (next: 'top' | 'bottom') => setPreferences({ pinoutViews: { ...pinoutViews, [viewKey]: next } });
  const uses = pinUses(hw, side);
  const ic = interconnectOf(hw.controller);
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
            <button type="button" className={`pinout-pad ${useClass(uses.get(pin))}${use ? ' used' : ''}`} aria-label={use ? `${pad.label}: ${use}` : pad.label} onClick={() => onPick(pin)}>
              <span className="pinout-label">{pad.label}</span>
              {pad.mcu?.[hw.controller] && <span className="pinout-sub">{pad.mcu[hw.controller]}</span>}
              {use && <span className="pinout-use">{use}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
  return (
    <figure className="pinout" aria-label={`${ic.name} pinout${side ? ` (${side} half)` : ''}`}>
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
        {column(view === 'top' ? ic.header.left : ic.header.right, 'left')}
        <div className="pinout-usb" aria-hidden="true">USB</div>
        {column(view === 'top' ? ic.header.right : ic.header.left, 'right')}
      </div>
    </figure>
  );
}
