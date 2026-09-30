import type { StudioSession } from '../state/studioSession.ts';
import { Icon } from './Icon.tsx';
import { Menu } from './ui/Menu.tsx';

interface StudioConnectProps {
  session: StudioSession;
  /** The browser can talk to a keyboard (Web Serial), or a test or fake keyboard stands in. */
  supported: boolean;
}

const UNSUPPORTED = 'Changing keys live needs Chrome or Edge on a computer (Web Serial). Build & flash works everywhere.';

/**
 * The top bar's ZMK Studio control, shaped like the keyboard button: an icon, a name and a
 * "ZMK Studio" line saying where the connection is at.
 */
export function StudioConnect({ session, supported }: StudioConnectProps) {
  const { status, deviceName, needsBuild } = session;

  if (status.phase === 'idle' || status.phase === 'error') {
    return (
      <button
        type="button"
        className="studio-pill"
        aria-label="Connect keyboard"
        disabled={!supported}
        title={!supported ? UNSUPPORTED : status.phase === 'error' ? `Couldn’t connect: ${status.message}` : 'Change keys live on a keyboard with ZMK Studio, over USB'}
        onClick={() => void session.connect()}
      >
        <span className="studio-icon" aria-hidden="true">
          <Icon name="usb" size={17} />
        </span>
        <span className="studio-text">
          <span className="studio-name">Connect keyboard</span>
          <span className="studio-meta">{status.phase === 'error' ? 'ZMK Studio · couldn’t connect' : 'ZMK Studio · USB'}</span>
        </span>
      </button>
    );
  }

  const pending = needsBuild.size;
  const [name, meta] =
    status.phase === 'connecting' || status.phase === 'loading'
      ? ['Connecting…', 'ZMK Studio']
      : status.phase === 'locked'
        ? ['Press your unlock key', 'ZMK Studio · locked']
        : status.phase === 'mismatch'
          ? ['Choose a keymap', 'ZMK Studio']
          : [deviceName ?? 'Keyboard', 'ZMK Studio · live'];

  return (
    <div className={`studio-pill studio-status ${status.phase}`}>
      <span className="studio-icon" aria-hidden="true">
        <Icon name={status.phase === 'locked' ? 'lock' : 'usb'} size={17} />
      </span>
      <span className="studio-text" role="status">
        <span className="studio-name">{name}</span>
        <span className="studio-meta">
          {meta}
          {status.phase === 'connected' && pending > 0 && (
            <span className="studio-pending" title="These changes stay in the editor and reach the keyboard with the next Build & flash.">
              {' '}
              · {pending} need{pending === 1 ? 's' : ''} a build
            </span>
          )}
        </span>
      </span>
      <Menu label="Keyboard connection" icon="chevronDown" items={[{ label: 'Disconnect', icon: 'x', onSelect: () => session.disconnect() }]} />
    </div>
  );
}
