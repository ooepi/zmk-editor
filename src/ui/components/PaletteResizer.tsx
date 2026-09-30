import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { setPreferences } from '../state/preferences.ts';

export const MIN_PALETTE_HEIGHT = 160;
const STEP = 24;

/** The tallest the palette may get: three quarters of the window, so the keyboard always shows. */
const maxHeight = () => Math.max(MIN_PALETTE_HEIGHT, Math.round(window.innerHeight * 0.75));
const clamp = (h: number) => Math.round(Math.min(maxHeight(), Math.max(MIN_PALETTE_HEIGHT, h)));

/**
 * The palette's top edge: drag it (or focus it and press ↑/↓) to make the palette taller or
 * shorter; double-click goes back to the default height.
 */
export function PaletteResizer({ height, palette }: { height: number | null; palette: () => HTMLElement | null }) {
  const drag = useRef<{ y: number; start: number } | null>(null);
  const current = () => clamp(height ?? palette()?.getBoundingClientRect().height ?? MIN_PALETTE_HEIGHT);
  const set = (h: number) => setPreferences({ paletteHeight: clamp(h) });

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { y: event.clientY, start: current() };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current) set(drag.current.start + drag.current.y - event.clientY);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const change = event.key === 'ArrowUp' ? STEP : event.key === 'ArrowDown' ? -STEP : 0;
    if (!change) return;
    event.preventDefault();
    set(current() + change);
  };

  return (
    <div
      className="palette-resizer"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize palette"
      aria-valuemin={MIN_PALETTE_HEIGHT}
      aria-valuemax={maxHeight()}
      aria-valuenow={height ?? undefined}
      tabIndex={0}
      title="Drag to resize the palette; double-click for the default height"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onKeyDown={onKeyDown}
      onDoubleClick={() => setPreferences({ paletteHeight: null })}
    />
  );
}
