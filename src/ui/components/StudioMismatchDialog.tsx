import type { KeymapModel } from '../../core/keymap/model.ts';
import type { StudioSession } from '../state/studioSession.ts';
import { Dialog } from './ui/Dialog.tsx';

/** How many differing keys the dialog lists before "and N more". */
const SHOWN = 8;

/** The keyboard's keymap isn't the editor's: send ours, take theirs, or edit the keyboard on its own. */
export function StudioMismatchDialog({ session, keymap }: { session: StudioSession; keymap: KeymapModel }) {
  const { status } = session;
  const comparison = status.phase === 'mismatch' ? status.comparison : null;
  const layerName = (index: number) => {
    const layer = keymap.layers[index];
    return layer ? (layer.displayName ?? layer.name) : `Layer ${index}`;
  };
  return (
    <Dialog
      open={comparison !== null}
      title="The keyboard has a different keymap"
      description={
        !comparison
          ? undefined
          : comparison.keyCountMatches
            ? `It differs from your config: ${comparison.summary}. Which one should both have?`
            : 'Its keys don’t match your config, so it’s probably another keyboard. You can edit its own keymap instead; your config stays on GitHub.'
      }
      onClose={() => void session.resolveMismatch('cancel')}
    >
      {comparison?.keyCountMatches && comparison.keys.length > 0 && (
        <ul className="studio-diff">
          {comparison.keys.slice(0, SHOWN).map((k) => (
            <li key={`${k.layer}:${k.key}`}>
              <span className="muted">
                {layerName(k.layer)}, key {k.key}:
              </span>{' '}
              <code>{k.editor}</code> in your config, <code>{k.keyboard}</code> on the keyboard
            </li>
          ))}
          {comparison.keys.length > SHOWN && <li className="muted">and {comparison.keys.length - SHOWN} more</li>}
        </ul>
      )}
      <div className="row wrap studio-choices">
        {comparison?.keyCountMatches ? (
          <>
            <button type="button" className="button primary" data-autofocus onClick={() => void session.resolveMismatch('editor')}>
              Send my config to the keyboard
            </button>
            <button type="button" className="button" onClick={() => void session.resolveMismatch('keyboard')}>
              Bring the keyboard’s keymap into the editor
            </button>
          </>
        ) : (
          <button type="button" className="button primary" data-autofocus onClick={() => void session.resolveMismatch('replace')}>
            Edit the keyboard’s own keymap
          </button>
        )}
        <button type="button" className="button" onClick={() => void session.resolveMismatch('cancel')}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
