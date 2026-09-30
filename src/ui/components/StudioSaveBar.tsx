import type { StudioSession } from '../state/studioSession.ts';
import { Icon } from './Icon.tsx';

/** Shown while the keyboard has changes it hasn't saved: they're lost when it loses power. */
export function StudioSaveBar({ session }: { session: StudioSession }) {
  const live = session.status.phase === 'connected' || session.status.phase === 'locked';
  if (!live || (!session.unsaved && !session.error)) return null;
  return (
    <div className="studio-savebar" role="region" aria-label="Unsaved keyboard changes">
      <Icon name="usb" size={16} />
      <span className="studio-savebar-text">
        {session.error ?? 'Live on the keyboard, not saved yet. Unplugging it loses these changes.'}
      </span>
      {session.unsaved && (
        <>
          <button type="button" className="button" onClick={() => void session.discard()}>
            Discard
          </button>
          <button type="button" className="button primary" onClick={() => void session.save()}>
            Save to keyboard
          </button>
        </>
      )}
    </div>
  );
}
