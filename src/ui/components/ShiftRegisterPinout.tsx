import { pinLabel } from '../../core/hardware/interconnects.ts';
import { drivenList, OUTPUTS_PER_REGISTER, outputUses, shiftPins } from '../../core/hardware/shiftRegisters.ts';
import type { KeyboardHardware, Pin } from '../../core/hardware/types.ts';
import { ChipPinout, type ChipPad } from './ChipPinout.tsx';
import { padClass } from './padClass.ts';

interface Props {
  hw: KeyboardHardware;
  /** The field a click will fill in, e.g. "Column 9"; none picked when undefined. */
  label?: string;
  /** An output picked first, waiting for a field. */
  picked?: number;
  onPick: (output: number) => void;
}

/** The output letters in order: output 0 is QA. */
const Q = ['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH'];

/**
 * The 74HC595s seen from above, notch at the top, in the order they're chained
 * (U1 is wired to the controller). Clicking an output fills the selected field;
 * the other pins show what they're wired to.
 */
export function ShiftRegisterPinout({ hw, label, picked, onPick }: Props) {
  const pins = shiftPins(hw);
  if (!pins || !hw.shiftRegisters) return null;
  const count = hw.shiftRegisters.count;
  const uses = outputUses(hw);
  const lines = drivenList(hw) === 'rows' ? 'row' : 'column';
  const output = (n: number, pin: number): ChipPad => {
    const letter = Q[n % OUTPUTS_PER_REGISTER] ?? '';
    const use = uses.get(n)?.join(', ');
    return {
      label: letter,
      inner: String(pin),
      use,
      kind: 'pin',
      tone: padClass(uses.get(n)),
      name: `${letter}, output ${n}${use ? `: ${use}` : ''}`,
      pressed: n === picked,
      onClick: () => onPick(n),
    };
  };
  const signal = (name: string, pin: number, use: string): ChipPad => ({ label: name, inner: String(pin), use, kind: 'signal', tone: 'use-shift' });
  const reserved = (name: string, pin: number, use?: string): ChipPad => ({ label: name, inner: String(pin), use, kind: 'reserved' });
  const wire = (what: string, pin: Pin) => `${what} · ${pin === null ? 'no pin' : pinLabel(pin)}`;
  return (
    <figure className="pinout" aria-label="Shift register pinout">
      <figcaption className="muted small">
        74HC595s seen from above, notch at the top; U1 is wired to the controller.{' '}
        <span>
          {label
            ? `Picking an output for ${label}.`
            : picked !== undefined
              ? `Output ${picked} picked: click a ${lines} field to put it there.`
              : `Click a ${lines} field, then an output, or an output, then its field.`}
        </span>
      </figcaption>
      <div className="chip-stack">
        {Array.from({ length: count }, (_, r) => {
          const first = r * OUTPUTS_PER_REGISTER;
          const left = [1, 2, 3, 4, 5, 6, 7].map((q) => output(first + q, q));
          const right = [
            reserved('VCC', 16, '3.3V'),
            output(first, 15),
            r === 0 ? signal('SER', 14, wire('Data', pins.data)) : signal('SER', 14, `From U${r} QH′`),
            reserved('OE', 13, 'GND'),
            signal('RCLK', 12, wire('Latch', pins.latch)),
            signal('SRCLK', 11, wire('Clock', pins.clock)),
            reserved('SRCLR', 10, '3.3V'),
            r < count - 1 ? signal('QH′', 9, `To U${r + 2} SER`) : reserved('QH′', 9, 'Not used'),
          ];
          return <ChipPinout key={r} shape="ic" title={`U${r + 1} · 74HC595`} groupLabel={`U${r + 1}`} left={[...left, reserved('GND', 8)]} right={right} />;
        })}
      </div>
    </figure>
  );
}
