import type { ReactNode } from 'react';
import { Icon, type IconName } from '../Icon.tsx';

interface SectionProps {
  title: ReactNode;
  /** The region's accessible name; defaults to `title` when that's a string. */
  label?: string;
  icon?: IconName;
  /** One line under the title. */
  description?: ReactNode;
  /** Buttons on the right of the header. */
  actions?: ReactNode;
  /** Something before the title, like a mini keycap (use it instead of `icon`). */
  lead?: ReactNode;
  /** `flat`: no card background or border, for a section inside something that already is one. */
  variant?: 'card' | 'flat';
  className?: string;
  children?: ReactNode;
}

/** A titled card: an optional icon, a title and description, header actions, then content. */
export function Section({ title, label, icon, description, actions, lead, variant = 'card', className, children }: SectionProps) {
  const name = label ?? (typeof title === 'string' ? title : undefined);
  const classes = ['section', variant === 'flat' && 'flat', className].filter(Boolean).join(' ');
  return (
    <section className={classes} aria-label={name}>
      <header className="section-head">
        {lead ??
          (icon && (
            <span className="section-icon">
              <Icon name={icon} size={18} />
            </span>
          ))}
        <div className="section-heading">
          <h2 className="section-title">{title}</h2>
          {description && <div className="section-description">{description}</div>}
        </div>
        {actions && <div className="section-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
