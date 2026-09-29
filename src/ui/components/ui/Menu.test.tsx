// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Menu, type MenuItem } from './Menu.tsx';

afterEach(cleanup);

const setup = (resetDisabled = false) => {
  const fns = { open: vi.fn(), save: vi.fn(), reset: vi.fn() };
  const items: MenuItem[] = [
    { label: 'Open files', icon: 'open', onSelect: fns.open },
    { label: 'Download .keymap', icon: 'download', onSelect: fns.save },
    'separator',
    { label: 'Reset to demo', icon: 'reset', onSelect: fns.reset, disabled: resetDisabled, tone: 'danger' },
  ];
  render(
    <>
      <Menu label="More actions" items={items} />
      <button type="button">Outside</button>
    </>,
  );
  return { user: userEvent.setup(), fns, trigger: screen.getByRole('button', { name: 'More actions' }) };
};

describe('Menu', () => {
  it('opens from its trigger, focuses the first item and runs the chosen one', async () => {
    const { user, fns, trigger } = setup();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Open files', 'Download .keymap', 'Reset to demo']);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Open files' }));
    await user.click(screen.getByRole('menuitem', { name: 'Download .keymap' }));
    expect(fns.save).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('moves with the arrow keys, Home and End, skipping disabled items', async () => {
    const { user, trigger } = setup(true);
    await user.click(trigger);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toBe('Download .keymap');
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toBe('Open files');
    await user.keyboard('{End}');
    expect(document.activeElement?.textContent).toBe('Download .keymap');
    await user.keyboard('{Home}{ArrowUp}');
    expect(document.activeElement?.textContent).toBe('Download .keymap');
  });

  it('runs the focused item with Enter', async () => {
    const { user, fns, trigger } = setup();
    await user.click(trigger);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(fns.save).toHaveBeenCalledOnce();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on a click outside and on Tab', async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('menu')).toBeNull();
    await user.click(trigger);
    await user.tab();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not run a disabled item', async () => {
    const { user, fns, trigger } = setup(true);
    await user.click(trigger);
    const reset = screen.getByRole('menuitem', { name: 'Reset to demo' });
    expect(reset).toHaveProperty('disabled', true);
    await user.click(reset);
    expect(fns.reset).not.toHaveBeenCalled();
  });
});
