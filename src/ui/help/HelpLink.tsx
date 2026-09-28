import type { ReactNode } from 'react';
import { useOpenHelp } from './helpContext.ts';

/** A small "Learn more" link that opens Help at a section. */
export function HelpLink({ to, children = 'Learn more' }: { to: string; children?: ReactNode }) {
  const openHelp = useOpenHelp();
  return (
    <button type="button" className="link-button help-link" onClick={() => openHelp(to)}>
      {children}
    </button>
  );
}
