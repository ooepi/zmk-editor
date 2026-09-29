import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Icon, type IconName } from '../Icon.tsx';
import { IconButton } from './IconButton.tsx';

export type MenuItem =
  | { label: string; icon?: IconName; onSelect: () => void; disabled?: boolean; title?: string | undefined; tone?: 'danger' }
  | 'separator';

interface MenuProps {
  /** Names the trigger button and the menu. */
  label: string;
  icon?: IconName;
  items: MenuItem[];
  /** Which edge of the trigger the menu lines up with. */
  align?: 'start' | 'end';
}

/** A dropdown of actions behind an icon button: arrow keys move, Esc closes, a click outside closes. */
export function Menu({ label, icon = 'more', items, align = 'end' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  const enabledItems = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
  const trigger = () => anchor.current?.querySelector<HTMLButtonElement>('button');
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger()?.focus();
  };

  // Opening focuses the first item; a press outside closes.
  useEffect(() => {
    if (!open) return;
    enabledItems()[0]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    const list = enabledItems();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const focus = (index: number) => list[(index + list.length) % list.length]?.focus();
    if (event.key === 'ArrowDown') focus(at + 1);
    else if (event.key === 'ArrowUp') focus(at - 1);
    else if (event.key === 'Home') focus(0);
    else if (event.key === 'End') focus(list.length - 1);
    else if (event.key === 'Escape') {
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') {
      setOpen(false);
      return;
    } else return;
    event.preventDefault();
  };

  return (
    <span className="menu-anchor" ref={anchor}>
      <IconButton
        icon={icon}
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      />
      {open && (
        <div ref={menu} id={id} role="menu" aria-label={label} className={`menu ${align}`} onKeyDown={onKeyDown}>
          {items.map((item, index) =>
            item === 'separator' ? (
              <div key={`separator-${index}`} role="separator" className="menu-separator" />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={`menu-item${item.tone ? ` ${item.tone}` : ''}`}
                disabled={item.disabled}
                title={item.title}
                onClick={() => {
                  close(true);
                  item.onSelect();
                }}
              >
                {item.icon && <Icon name={item.icon} />}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </span>
  );
}
