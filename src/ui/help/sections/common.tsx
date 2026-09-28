import type { ReactNode } from 'react';
import { useOpenHelp } from '../helpContext.ts';

export interface HelpSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** A subsection with its own anchor, so links can open Help right at it. */
export function Sub({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div className="help-sub">
      <h3 id={`help-${id}`}>{title}</h3>
      {children}
    </div>
  );
}

/** A link to another place in the guide. */
export function See({ to, children }: { to: string; children: ReactNode }) {
  const openHelp = useOpenHelp();
  return (
    <button type="button" className="link-button" onClick={() => openHelp(to)}>
      {children}
    </button>
  );
}

/** A labelled control, written like the app shows it. */
export const Ui = ({ children }: { children: ReactNode }) => <strong className="help-ui">{children}</strong>;
