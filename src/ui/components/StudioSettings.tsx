import { useId, type Dispatch } from 'react';
import { findKeyboard } from '../../core/catalog/keyboards.ts';
import type { ZmkConfig } from '../../core/config.ts';
import { centralTarget, disableStudio, enableStudio, hasUnlockKey, spareLayers, studioEnabled } from '../../core/studio/enable.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { Icon } from './Icon.tsx';
import { NumberInput } from './ui/NumberInput.tsx';
import { Switch } from './ui/Switch.tsx';

const DEFAULT_SPARE = 2;
const MAX_SPARE = 8;

/** Settings ▸ ZMK Studio: build the firmware so keys can change live, without rebuilding. */
export function StudioSettings({ config, dispatch, onPlaceUnlock }: { config: ZmkConfig; dispatch: Dispatch<EditorAction>; onPlaceUnlock: () => void }) {
  const id = useId();
  const on = studioEnabled(config);
  const central = config.build.include[centralTarget(config.build.include)];
  const catalog = config.hardware ? undefined : findKeyboard(config.keyboard);
  const notReady = catalog !== undefined && !catalog.features.includes('studio');
  const unlock = hasUnlockKey(config.keymap);
  const edit = (next: ZmkConfig, notice: string) => dispatch({ type: 'editConfig', config: next, notice });

  return (
    <div className="settings-group studio-settings">
      <header className="settings-group-head">
        <span className="settings-group-icon">
          <Icon name="usb" size={20} />
        </span>
        <div>
          <h3>ZMK Studio</h3>
          <p className="muted small">
            Change keys and layers live over USB, without building new firmware. Combos, behaviors and settings still need a build.
          </p>
        </div>
      </header>

      <div className="setting-row">
        <div className="setting-text">
          <span className="setting-title">
            <label htmlFor={id}>Change keys without rebuilding</label>
          </span>
          <span id={`${id}-help`} className="setting-help">
            Adds ZMK Studio to the firmware{central ? ` of ${central.shield ?? central.board}` : ''}. Build and flash once, then connect the
            keyboard from the top bar in Chrome or Edge.
          </span>
        </div>
        <div className="setting-control">
          <Switch
            id={id}
            aria-describedby={`${id}-help`}
            checked={on}
            disabled={!central && !on}
            onChange={(checked) =>
              edit(
                checked ? enableStudio(config, spareLayers(config) || DEFAULT_SPARE) : disableStudio(config),
                checked ? 'ZMK Studio is on for the next build.' : 'ZMK Studio is off for the next build.',
              )
            }
          />
        </div>
      </div>

      {on && (
        <>
          <div className="setting-row">
            <div className="setting-text">
              <span className="setting-title">
                <label htmlFor={`${id}-spare`}>Spare layers</label>
              </span>
              <span className="setting-help">Empty layers Studio can switch on. It can’t add more than these without a new build.</span>
            </div>
            <div className="setting-control">
              <NumberInput
                id={`${id}-spare`}
                className="input"
                aria-label="Spare layers"
                min={0}
                max={MAX_SPARE}
                value={spareLayers(config)}
                onCommit={(n) => edit(enableStudio(config, Math.max(0, Math.min(MAX_SPARE, Math.round(n ?? 0)))), 'Spare layers changed.')}
              />
            </div>
          </div>

          <ul className="studio-checklist" aria-label="Before you connect">
            <li className="done">
              <Icon name="check" size={16} />
              <span>
                Studio goes on the central half: <span className="mono">{central?.shield ?? central?.board}</span>
              </span>
            </li>
            <li className={unlock ? 'done' : ''}>
              <Icon name={unlock ? 'check' : 'usb'} size={16} />
              {unlock ? (
                <span>The unlock key is on your keymap.</span>
              ) : (
                <>
                  <span className="grow">Put the unlock key on your keymap</span>
                  <button type="button" className="button" onClick={onPlaceUnlock}>
                    Place it
                  </button>
                </>
              )}
            </li>
            <li>
              <Icon name="rocket" size={16} />
              <span>Build and flash once. After that, connect the keyboard from the top bar.</span>
            </li>
          </ul>
        </>
      )}

      {notReady && (
        <p className="notice">
          ZMK doesn’t list {catalog.name} as ready for Studio yet: it may lack the physical layout Studio needs. The build can still work.
        </p>
      )}
    </div>
  );
}
