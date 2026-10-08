import { useMemo } from 'react';
import { HARDWARE_CONTROLLERS } from '../../core/hardware/controllers.ts';
import { shieldDir } from '../../core/hardware/definition.ts';
import { generateShield } from '../../core/hardware/generate.ts';
import { shiftSummary } from '../../core/hardware/shiftRegisters.ts';
import type { KeyboardHardware } from '../../core/hardware/types.ts';
import { hasErrors, type HardwareIssue } from '../../core/hardware/validate.ts';
import { HardwareIssueList } from './HardwareIssueList.tsx';

export function HardwareReviewStep({ hw, issues }: { hw: KeyboardHardware; issues: HardwareIssue[] }) {
  const files = useMemo(() => Object.entries(generateShield(hw)), [hw]);
  const controller = HARDWARE_CONTROLLERS.find((c) => c.id === hw.controller)?.name ?? hw.controller;
  return (
    <div className="stack">
      {hasErrors(issues) ? (
        <p className="field-error">Fix these before going on:</p>
      ) : (
        <p>
          {hw.displayName}: {hw.keys.length} keys{hw.split ? ' on two halves' : ''}, for a {controller}.
        </p>
      )}
      {!hasErrors(issues) && shiftSummary(hw) && <p>{shiftSummary(hw)}</p>}
      <HardwareIssueList issues={issues} />
      <h3>Files the editor writes</h3>
      <p className="muted small">
        They go in {shieldDir(hw.name)}/ in your repo, next to the keymap, and are regenerated whenever you edit the hardware.
      </p>
      {files.map(([path, text]) => (
        <details key={path} className="raw-conf">
          <summary className="mono">{path}</summary>
          <pre className="source" aria-label={path}>{text}</pre>
        </details>
      ))}
    </div>
  );
}
