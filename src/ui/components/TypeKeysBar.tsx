import { setPreferences, usePreferences } from '../state/preferences.ts';
import { Switch } from './ui/Switch.tsx';

/** The typing switches, floating under the keyboard while a key is selected. */
export function TypeKeysBar() {
  const { typeAdvance, typeAllKeys } = usePreferences();
  return (
    <div className="type-keys-bar" role="group" aria-label="Typing keys">
      <label className="type-keys-switch" title="After you type a key, the next key in the row is selected.">
        <Switch checked={typeAdvance} onChange={(on) => setPreferences({ typeAdvance: on })} />
        <span>Move to next key</span>
      </label>
      <label
        className="type-keys-switch"
        title="Esc, Backspace, Delete, Tab, Enter and Space go onto the map too. Click empty space to stop."
      >
        <Switch checked={typeAllKeys} onChange={(on) => setPreferences({ typeAllKeys: on })} />
        <span>Type all keys</span>
      </label>
    </div>
  );
}
