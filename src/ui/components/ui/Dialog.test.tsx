// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Dialog } from './Dialog.tsx';

afterEach(cleanup);

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open it
      </button>
      <Dialog open={open} title="Pick one" description="Choose a thing." onClose={() => setOpen(false)}>
        <button type="button">First</button>
        <button type="button" data-autofocus>
          Second
        </button>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('opens named, focuses the marked control, and closes with the ✕ back to the opener', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    const dialog = screen.getByRole('dialog', { name: 'Pick one' });
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Second' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open it' }));
  });

  it('closes on Esc', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('focuses the fallback when the opener is gone', async () => {
    const user = userEvent.setup();
    function Vanishing() {
      const [open, setOpen] = useState(false);
      const [gone, setGone] = useState(false);
      return (
        <>
          <button type="button" id="fallback">
            Fallback
          </button>
          {!gone && (
            <button type="button" onClick={() => setOpen(true)}>
              Opens and vanishes
            </button>
          )}
          <Dialog
            open={open}
            title="Pick"
            onClose={() => {
              // Like an empty state's button once the first behavior exists.
              setGone(true);
              setOpen(false);
            }}
            fallbackFocus={() => document.getElementById('fallback')}
          >
            <p>Body</p>
          </Dialog>
        </>
      );
    }
    render(<Vanishing />);
    await user.click(screen.getByRole('button', { name: 'Opens and vanishes' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fallback' }));
  });
});
