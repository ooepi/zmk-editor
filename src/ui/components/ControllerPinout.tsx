import { interconnectOf, type HeaderPad } from '../../core/hardware/interconnects.ts';
import { shiftPins } from '../../core/hardware/shiftRegisters.ts';
import type { KeyboardHardware, Side } from '../../core/hardware/types.ts';
import { pinUses } from '../../core/hardware/wiring.ts';
import { setPreferences, usePreferences } from '../state/preferences.ts';
import { ChipPinout, type ChipPad } from './ChipPinout.tsx';
import { padClass } from './padClass.ts';

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
  const sharedBus = side === undefined && Boolean(shiftPins(hw)?.shared);
  const ic = interconnectOf(hw.controller);
  const pads = (header: HeaderPad[]): ChipPad[] =>
    header.map((pad): ChipPad => {
      const pin = pad.pin;
      if (pin === null) return { label: pad.label, kind: 'reserved' };
      const use = uses.get(pin)?.join(', ');
      return { label: pad.label, inner: pad.mcu?.[hw.controller], use, kind: 'pin', tone: padClass(uses.get(pin), sharedBus), onClick: () => onPick(pin) };
    });
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
      <ChipPinout
        shape="board"
        title={ic.name}
        left={pads(view === 'top' ? ic.header.left : ic.header.right)}
        right={pads(view === 'top' ? ic.header.right : ic.header.left)}
      />
    </figure>
  );
}
