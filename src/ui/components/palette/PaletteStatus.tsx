import { HelpLink } from '../../help/HelpLink.tsx';

interface PaletteStatusProps {
  /** The tile being placed by clicking keys, named for people. */
  armed: { name: string } | null;
  selection: readonly number[];
  hasEncoders: boolean;
  onStop: () => void;
}

/** One line that says what clicking a tile will do right now. */
export function PaletteStatus({ armed, selection, hasEncoders, onStop }: PaletteStatusProps) {
  if (armed) {
    return (
      <p className="palette-status armed" role="status">
        <span>Placing {armed.name}: click keys to put it on them.</span>{' '}
        <button type="button" className="link-button" aria-label="Stop placing" onClick={onStop}>
          Stop (Esc)
        </button>
      </p>
    );
  }
  const text =
    selection.length > 1
      ? `Click a tile to put it on the ${selection.length} selected keys, or drag a tile onto any key.`
      : selection.length === 1
        ? `Click a tile to put it on key ${selection[0]}, or drag a tile onto any key.`
        : `Select a key, then click a tile. Or drag a tile onto any key.${hasEncoders ? " Tiles also drop onto an encoder's ↺ or ↻ side." : ''}`;
  return (
    <p className="palette-status" role="status">
      <span>{text}</span> <HelpLink to="palette" />
    </p>
  );
}
