import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconButton } from './IconButton.tsx';

interface DialogProps {
  open: boolean;
  title: string;
  /** One line under the title. */
  description?: string;
  onClose: () => void;
  /** Where focus goes on close if the opener is gone (e.g. an empty state's button). */
  fallbackFocus?: () => HTMLElement | null | undefined;
  children: ReactNode;
}

/**
 * A modal over native `<dialog>`: focus moves in and is trapped by the browser, Esc, the ✕ or a
 * click on the backdrop closes it, and focus returns to whatever opened it. Mark the control that
 * should take focus first with `data-autofocus`.
 */
export function Dialog({ open, title, description, onClose, fallbackFocus, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // jsdom has no showModal; there the dialog is simply shown open.
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    // Start on the element marked data-autofocus, rather than the ✕ that comes first.
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      (opener?.isConnected ? opener : fallbackFocus?.())?.focus();
    };
    // Only opening and closing matter; fallbackFocus is read when it closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        // The native cancel event covers real browsers; this covers the jsdom fallback.
        if (e.key === 'Escape' && typeof ref.current?.showModal !== 'function') onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-body">
        <header className="dialog-header">
          <div>
            <h2 id={`${id}-title`} className="dialog-title">
              {title}
            </h2>
            {description && (
              <p id={`${id}-description`} className="muted small">
                {description}
              </p>
            )}
          </div>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </header>
        {children}
      </div>
    </dialog>
  );
}
