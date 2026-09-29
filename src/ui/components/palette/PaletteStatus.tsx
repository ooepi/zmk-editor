import { HelpLink } from '../../help/HelpLink.tsx';

interface PaletteStatusProps {
  /** The tile being placed by clicking keys, named for people. */
  armed: { name: string } | null;
  selection: readonly number[];
  hasEncoders: boolean;
  /** The palette is folded away: there are no tiles to click. */
  collapsed: boolean;
  onStop: () => void;
}

/**
 * One line that says what clicking a tile will do right now. Only placing is announced (a polite
 * live region, not role=status: the app's own notice is the page's status message); the hint
 * that follows every key click would otherwise be read out again and again.
 */
export function PaletteStatus({ armed, selection, hasEncoders, collapsed, onStop }: PaletteStatusProps) {
  if (armed) {
    return (
      <p className="palette-status armed" aria-live="polite">
        <span>Placing {armed.name}: click keys to put it on them.</span>{' '}
        <button type="button" className="link-button" aria-label="Stop placing" onClick={onStop}>
          Stop (Esc)
        </button>
      </p>
    );
  }
  const text = collapsed
    ? 'The palette is hidden. Show it to place keys and behaviors.'
    : selection.length > 1
      ? `Click a tile to put it on the ${selection.length} selected keys, or drag a tile onto any key.`
      : selection.length === 1
        ? `Click a tile to put it on key ${selection[0]}, or drag a tile onto any key.`
        : `Select a key, then click a tile. Or drag a tile onto any key.${hasEncoders ? " Tiles also drop onto an encoder's ↺ or ↻ side." : ''}`;
  return (
    <p className="palette-status">
      <span>{text}</span> <HelpLink to="palette" />
    </p>
  );
}
