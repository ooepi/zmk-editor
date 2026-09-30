// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App.tsx';
import { reloadPreferences } from './state/preferences.ts';

beforeEach(() => {
  localStorage.clear();
  reloadPreferences();
});
afterEach(cleanup);

const palette = () => screen.getByRole('region', { name: 'Key palette' });
const handle = () => screen.getByRole('separator', { name: 'Resize palette' });

describe('resizing the palette', () => {
  it('grows and shrinks with the arrow keys, and remembers the height', async () => {
    const user = userEvent.setup();
    render(<App />);
    handle().focus();
    await user.keyboard('{ArrowUp}');
    const grown = Number(handle().getAttribute('aria-valuenow'));
    expect(grown).toBeGreaterThanOrEqual(160);
    expect(palette().style.height).toBe(`${grown}px`);
    await user.keyboard('{ArrowDown}');
    expect(Number(handle().getAttribute('aria-valuenow'))).toBeLessThan(grown);

    cleanup();
    reloadPreferences();
    render(<App />);
    expect(palette().style.height).not.toBe('');
  });

  it('follows a drag of its top edge, within limits', () => {
    render(<App />);
    fireEvent.keyDown(handle(), { key: 'ArrowUp' });
    const start = Number(handle().getAttribute('aria-valuenow'));
    fireEvent.pointerDown(handle(), { clientY: 500, pointerId: 1, button: 0 });
    fireEvent.pointerMove(handle(), { clientY: 440, pointerId: 1 });
    fireEvent.pointerUp(handle(), { clientY: 440, pointerId: 1 });
    expect(palette().style.height).toBe(`${start + 60}px`);
    fireEvent.pointerDown(handle(), { clientY: 500, pointerId: 1, button: 0 });
    fireEvent.pointerMove(handle(), { clientY: 5000, pointerId: 1 });
    fireEvent.pointerUp(handle(), { clientY: 5000, pointerId: 1 });
    expect(palette().style.height).toBe('160px');
  });

  it('goes back to the default height on double-click, and is gone while hidden', async () => {
    const user = userEvent.setup();
    render(<App />);
    fireEvent.keyDown(handle(), { key: 'ArrowUp' });
    await user.dblClick(handle());
    expect(palette().style.height).toBe('');
    await user.click(screen.getByRole('button', { name: 'Hide palette' }));
    expect(screen.queryByRole('separator', { name: 'Resize palette' })).toBeNull();
  });
});
