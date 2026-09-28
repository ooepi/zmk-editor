import type { HardwareIssue } from '../../core/hardware/validate.ts';

const isMissingPin = (issue: HardwareIssue) => issue.level === 'error' && issue.area === 'wiring' && issue.message.endsWith(' has no pin.');

/**
 * Problems with the keyboard; errors block creating it. Pins not picked yet
 * are summed up in one line, so a fresh keyboard isn't a wall of red.
 */
export function HardwareIssueList({ issues }: { issues: HardwareIssue[] }) {
  if (issues.length === 0) return null;
  const missing = issues.filter(isMissingPin);
  const shown = missing.length > 1 ? issues.filter((issue) => !isMissingPin(issue)) : issues;
  return (
    <ul className="notes" aria-label="Problems">
      {missing.length > 1 && <li className="field-error">{missing.length} pin fields don’t have a pin yet.</li>}
      {shown.map((issue) => (
        <li key={issue.message} className={issue.level === 'error' ? 'field-error' : 'muted'}>
          {issue.message}
        </li>
      ))}
    </ul>
  );
}
