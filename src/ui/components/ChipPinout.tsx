/** One pin beside a drawn chip. */
export interface ChipPad {
  /** Next to the chip, e.g. "D4" or "QA". */
  label: string;
  /** Written on the chip beside the pin, e.g. "P0.22" or "15". */
  inner?: string;
  /** What it's used for, on the outer side, e.g. "Row 0". */
  use?: string;
  /**
   * `pin`: a pin you can pick (a button). `signal`: wired to something fixed, shown
   * in its colour. `reserved`: power and the like, drawn muted.
   */
  kind: 'pin' | 'signal' | 'reserved';
  /** Colour class from `padClass`, e.g. "use-row". */
  tone?: string;
  /** The button's accessible name; defaults to the label and use. */
  name?: string;
  /** Picked first, waiting for a field to put it in. */
  pressed?: boolean;
  onClick?: () => void;
}

interface Props {
  /** "board" (a controller, round holes, USB at the top) or "ic" (a DIP chip, square leads, a pin-1 dot). */
  shape: 'board' | 'ic';
  /** Written on the chip, e.g. "nRF52840" or "74HC595". */
  title: string;
  left: ChipPad[];
  right: ChipPad[];
  /** Names the chip as a group, e.g. "U1". */
  groupLabel?: string;
}

/**
 * A chip drawn between its two rows of pins: each pin's name on the chip next to its
 * hole, its label next to the chip and its use on the outer side, so both sides mirror.
 */
export function ChipPinout({ shape, title, left, right, groupLabel }: Props) {
  const rows = Math.max(left.length, right.length);
  return (
    <div className={`chip-pinout ${shape}`} role={groupLabel ? 'group' : undefined} aria-label={groupLabel}>
      <div className="chip-body" style={{ gridRow: `1 / span ${rows}` }} aria-hidden="true">
        {shape === 'board' ? <span className="chip-usb">USB</span> : <span className="chip-dot" />}
        <span className="chip-title">{title}</span>
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <PinRow key={i} row={i + 1} left={left[i]} right={right[i]} />
      ))}
    </div>
  );
}

function PinRow({ row, left, right }: { row: number; left?: ChipPad; right?: ChipPad }) {
  return (
    <>
      <div className="chip-cell left" style={{ gridRow: row }}>
        {left && <Pad pad={left} side="left" />}
      </div>
      <div className="chip-pins" style={{ gridRow: row }} aria-hidden="true">
        <span className="chip-pin">
          {left && <span className={hole(left)} />}
          {left?.inner && <span className="chip-inner">{left.inner}</span>}
        </span>
        <span className="chip-pin">
          {right?.inner && <span className="chip-inner">{right.inner}</span>}
          {right && <span className={hole(right)} />}
        </span>
      </div>
      <div className="chip-cell right" style={{ gridRow: row }}>
        {right && <Pad pad={right} side="right" />}
      </div>
    </>
  );
}

const used = (pad: ChipPad) => pad.kind !== 'reserved' && pad.use !== undefined;

const hole = (pad: ChipPad) => `chip-hole ${pad.kind}${pad.tone ? ` ${pad.tone}` : ''}${used(pad) ? ' used' : ''}`;

function Pad({ pad, side }: { pad: ChipPad; side: 'left' | 'right' }) {
  const className = `pinout-pad ${side} ${pad.kind}${pad.tone ? ` ${pad.tone}` : ''}${used(pad) ? ' used' : ''}${pad.pressed ? ' armed' : ''}`;
  const content = [
    <span key="label" className="pinout-label">
      {pad.label}
    </span>,
    pad.use ? (
      <span key="use" className="pinout-use">
        {pad.use}
      </span>
    ) : null,
  ];
  // The label sits next to the chip on both sides, the use on the outer side.
  const ordered = side === 'left' ? content.reverse() : content;
  if (pad.kind !== 'pin') {
    return (
      <span className={className} title={pad.use ? `${pad.label}: ${pad.use}` : pad.label}>
        {ordered}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={className}
      aria-label={pad.name ?? (pad.use ? `${pad.label}: ${pad.use}` : pad.label)}
      aria-pressed={pad.pressed ?? false}
      title={pad.use}
      onClick={pad.onClick}
    >
      {ordered}
    </button>
  );
}
