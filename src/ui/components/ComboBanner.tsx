import { useEffect } from 'react';

interface ComboBannerProps {
  /** How many keys the combo has so far. */
  keys: number;
  /** Done was refused: the combo needs at least two keys. */
  blocked: boolean;
  onDone: () => void;
}

/** Over the keyboard while a combo is open: what to do, how far along it is, and the way out (Done or Esc). */
export function ComboBanner({ keys, blocked, onDone }: ComboBannerProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const typing =
        event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName));
      if (event.key === 'Escape' && !typing) onDone();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDone]);

  return (
    <div className={`combo-banner${blocked ? ' blocked' : ''}`} role="region" aria-label="Combo keys">
      <span className="combo-banner-text">Click the keys for this combo</span>
      <span className="badge">{keys === 0 ? 'No keys yet' : `${keys} key${keys === 1 ? '' : 's'}`}</span>
      {blocked && (
        <span className="combo-banner-error" role="alert">
          Pick at least two keys, or delete this combo.
        </span>
      )}
      <button type="button" className="button primary combo-banner-done" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
