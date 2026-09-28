import type { HardwareIssue } from '../../core/hardware/validate.ts';

/** Problems with the keyboard; errors block creating it. */
export function HardwareIssueList({ issues }: { issues: HardwareIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="notes" aria-label="Problems">
      {issues.map((issue) => (
        <li key={issue.message} className={issue.level === 'error' ? 'field-error' : 'muted'}>
          {issue.message}
        </li>
      ))}
    </ul>
  );
}
