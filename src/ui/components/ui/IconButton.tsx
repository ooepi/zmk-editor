import type { ComponentPropsWithoutRef } from 'react';
import { Icon, type IconName } from '../Icon.tsx';

type IconButtonProps = {
  icon: IconName;
  /** The accessible name, the default tooltip, and the text in the bubble when `expand` is set. */
  label: string;
  /** Show the label in a bubble under the button while it is hovered or focused. */
  expand?: boolean;
  tone?: 'danger';
} & Omit<ComponentPropsWithoutRef<'button'>, 'children'>;

/** A round icon-only button. The label names it for screen readers and appears as a tooltip. */
export function IconButton({ icon, label, expand, tone, className, title, ...rest }: IconButtonProps) {
  const classes = ['icon-button', expand && 'labelled', tone, className].filter(Boolean).join(' ');
  return (
    <button type="button" {...rest} className={classes} aria-label={label} title={title ?? label}>
      <Icon name={icon} size={18} strokeWidth={icon === 'grip' || icon === 'more' ? 3 : 2} />
      {expand && <span className="icon-button-label">{label}</span>}
    </button>
  );
}
