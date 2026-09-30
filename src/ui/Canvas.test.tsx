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

const view = () => screen.getByRole('group', { name: 'Keymap view' });
const stage = () => document.querySelector<HTMLElement>('.camera-stage');
const zoomLabel = () => screen.getByRole('button', { name: /^Fit the keyboard/ }).textContent;

describe('the keymap camera', () => {
  it('zooms with the buttons and fits again', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(zoomLabel()).toBe('100%');
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(zoomLabel()).toBe('125%');
    expect(stage()?.style.transform).toContain('scale(1.25)');
    await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(zoomLabel()).toBe('80%');
    await user.click(screen.getByRole('button', { name: /^Fit the keyboard/ }));
    expect(zoomLabel()).toBe('100%');
    expect(stage()?.style.transform).toBe('');
  });

  it('zooms with the wheel and pans with the middle button', () => {
    render(<App />);
    const canvas = document.querySelector<HTMLElement>('.canvas');
    if (!canvas) throw new Error('no canvas');
    fireEvent.wheel(canvas, { deltaY: -200, clientX: 0, clientY: 0 });
    expect(Number(zoomLabel()?.replace('%', ''))).toBeGreaterThan(100);
    fireEvent.pointerDown(canvas, { button: 1, clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerMove(canvas, { clientX: 150, clientY: 130, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 150, clientY: 130, pointerId: 2 });
    expect(stage()?.style.transform).toMatch(/translate\(50px, 30px\)/);
  });

  it('has a dot grid you can turn on, remembered', async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByRole('button', { name: 'Dot grid' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await user.click(toggle);
    expect(document.querySelector('.canvas')?.classList.contains('dot-grid')).toBe(true);
    cleanup();
    reloadPreferences();
    render(<App />);
    expect(screen.getByRole('button', { name: 'Dot grid' }).getAttribute('aria-pressed')).toBe('true');
    expect(view()).toBeTruthy();
  });
});
