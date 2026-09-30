import type { Dispatch } from 'react';
import type { ZmkConfig } from '../../core/config.ts';
import { findModule, ZMK_VERSIONS } from '../../core/catalog/modules.ts';
import { setZmkVersion } from '../../core/modules.ts';
import type { EditorAction } from '../state/editorReducer.ts';

interface VersionSelectProps {
  config: ZmkConfig;
  dispatch: Dispatch<EditorAction>;
}

/** One ZMK version for the firmware, every module and the build workflow. */
export function VersionSelect({ config, dispatch }: VersionSelectProps) {
  const version = config.west.zmkVersion;
  const change = (next: string) => {
    const result = setZmkVersion(config, next);
    if (result.ok) {
      dispatch({ type: 'editConfig', config: result.config, notice: `Switched ZMK, its modules and the build workflow to ${next}.` });
      return;
    }
    const names = result.blockedBy.map((id) => findModule(id)?.name ?? id).join(', ');
    dispatch({
      type: 'notify',
      notice: `Can't switch to ZMK ${next}: ${names} has no release for it. Remove ${result.blockedBy.length > 1 ? 'them' : 'it'} in Modules (or Screens) first.`,
    });
  };
  return (
    <label className="version-pill" title="ZMK version for the firmware, its modules and the build">
      <span className="version-pill-label" aria-hidden="true">
        ZMK
      </span>
      <select className="top-select" value={version} onChange={(e) => change(e.target.value)} aria-label="ZMK version">
        {!ZMK_VERSIONS.includes(version) && <option value={version}>{version}</option>}
        {ZMK_VERSIONS.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}
