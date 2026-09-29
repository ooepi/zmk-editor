import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

/** A small tinted pill for a count or a status. */
export function Badge({ tone = 'neutral', children, title }: { tone?: BadgeTone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge${tone === 'neutral' ? '' : ` tone-${tone}`}`} title={title}>
      {children}
    </span>
  );
}
