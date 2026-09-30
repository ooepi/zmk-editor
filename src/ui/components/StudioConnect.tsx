import type { StudioSession } from '../state/studioSession.ts';
import { Icon } from './Icon.tsx';
import { Menu } from './ui/Menu.tsx';

interface StudioConnectProps {
  session: StudioSession;
  /** The browser can talk to a keyboard (Web Serial), or a test or fake keyboard stands in. */
  supported: boolean;
}

const UNSUPPORTED = 'Changing keys live needs Chrome or Edge on a computer (Web Serial). Build & flash works everywhere.';

/** The top bar's ZMK Studio control: connect a keyboard, see whether it's live, disconnect. */
export function StudioConnect({ session, supported }: StudioConnectProps) {
  const { status, deviceName, needsBuild } = session;

  if (status.phase === 'idle' || status.phase === 'error') {
    return (
      <div className="studio-connect">
        <button
          type="button"
          className="studio-pill"
          disabled={!supported}
          title={!supported ? UNSUPPORTED : status.phase === 'error' ? `Couldn’t connect: ${status.message}` : 'Change keys live on a keyboard with ZMK Studio, over USB'}
          onClick={() => void session.connect()}
        >
          <Icon name="usb" size={15} />
          Connect keyboard
        </button>
      </div>
    );
  }

  const text =
    status.phase === 'connecting' || status.phase === 'loading'
      ? 'Connecting…'
      : status.phase === 'locked'
        ? 'Press your unlock key'
        : status.phase === 'mismatch'
          ? 'Choose a keymap'
          : null;
  const pending = needsBuild.size;

  return (
    <div className="studio-connect">
      <span className={`studio-pill studio-status ${status.phase}`} role="status">
        <span className="studio-dot" aria-hidden="true" />
        {text ?? (
          <>
            <span className="studio-name">{deviceName ?? 'Keyboard'}</span>
            <span className="studio-live">Live</span>
            {pending > 0 && (
              <span className="studio-pending" title="These changes stay in the editor and reach the keyboard with the next Build & flash.">
                {pending} need{pending === 1 ? 's' : ''} a build
              </span>
            )}
          </>
        )}
      </span>
      <Menu label="Keyboard connection" icon="chevronDown" items={[{ label: 'Disconnect', icon: 'x', onSelect: () => session.disconnect() }]} />
    </div>
  );
}
