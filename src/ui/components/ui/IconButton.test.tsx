// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IconButton } from './IconButton.tsx';

afterEach(cleanup);

describe('IconButton', () => {
  it('is named by its label and runs onClick', async () => {
    const onClick = vi.fn();
    render(<IconButton icon="undo" label="Undo" onClick={onClick} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Undo' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole('button').getAttribute('title')).toBe('Undo');
  });

  it('shows its label as text when expandable, and keeps a given title', () => {
    render(<IconButton icon="print" label="Print keymap" expand title="A cheat sheet of every layer" />);
    const button = screen.getByRole('button', { name: 'Print keymap' });
    expect(button.textContent).toBe('Print keymap');
    expect(button.getAttribute('title')).toBe('A cheat sheet of every layer');
    expect(button.className).toContain('expandable');
  });

  it('can be disabled', () => {
    render(<IconButton icon="redo" label="Redo" disabled />);
    expect(screen.getByRole('button', { name: 'Redo' })).toHaveProperty('disabled', true);
  });
});
