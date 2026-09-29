// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App.tsx';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

async function openBehaviors() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: /^Behaviors \(/ }));
  return user;
}

async function create(user: ReturnType<typeof userEvent.setup>, type: string) {
  await user.click(screen.getByRole('button', { name: 'New behavior' }));
  await user.click(within(screen.getByRole('dialog', { name: 'New behavior' })).getByRole('button', { name: type }));
}

describe('the behaviors list', () => {
  it('groups behaviors by kind with a count and a summary', async () => {
    const user = await openBehaviors();
    // The demo has two encoder behaviors.
    expect(within(screen.getByRole('list', { name: 'Encoders' })).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('list', { name: 'Hold-taps' })).toBeNull();

    await create(user, '+ Hold-tap');
    const holdTaps = screen.getByRole('list', { name: 'Hold-taps' });
    expect(within(holdTaps).getByRole('button', { name: /&ht/ }).textContent).toContain(
      'Hold: Key press · Tap: Key press · 200 ms',
    );
  });

  it('invites you to make the first macro', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Macros (0)' }));
    await user.click(screen.getByRole('button', { name: 'Create your first macro' }));
    expect(screen.getByRole('button', { name: /&macro/ }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('the New behavior dialog', () => {
  it('explains each type, and closes without creating on Esc', async () => {
    const user = await openBehaviors();
    await user.click(screen.getByRole('button', { name: 'New behavior' }));
    const dialog = screen.getByRole('dialog', { name: 'New behavior' });
    const cards = within(dialog).getAllByRole('button', { name: /^\+ / });
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual([
      '+ Hold-tap',
      '+ Mod-morph',
      '+ Tap-dance',
      '+ Encoder behavior',
    ]);
    expect(within(dialog).getByRole('button', { name: '+ Hold-tap' }).getAttribute('aria-describedby')).toBeTruthy();
    expect(document.activeElement).toBe(cards[0]);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Hold-taps' })).toBeNull();
  });

  it('creates and selects the chosen type', async () => {
    const user = await openBehaviors();
    await create(user, '+ Mod-morph');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      within(screen.getByRole('list', { name: 'Mod-morphs' }))
        .getByRole('button', { name: /&mm/ })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });
});

describe('the diagram editors', () => {
  it('sets a hold-tap’s tapping term from the timing strip', async () => {
    const user = await openBehaviors();
    await create(user, '+ Hold-tap');
    const slider = screen.getByRole('slider', { name: 'Tapping term' });
    // A drag moves the marker, and writes the term once, on release: one undo step.
    fireEvent.change(slider, { target: { value: '250' } });
    fireEvent.change(slider, { target: { value: '280' } });
    expect(screen.getByRole('button', { name: /&ht/ }).textContent).toContain('200 ms');
    fireEvent.pointerUp(slider);
    expect((screen.getByRole('spinbutton', { name: 'Tapping term (ms)' }) as HTMLInputElement).value).toBe('280');
    expect(screen.getByRole('button', { name: /&ht/ }).textContent).toContain('280 ms');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: /&ht/ }).textContent).toContain('200 ms');
  });

  it('shows a mod-morph’s modifiers as chips', async () => {
    const user = await openBehaviors();
    await create(user, '+ Mod-morph');
    const mods = screen.getByRole('group', { name: 'Morph on' });
    await user.click(within(mods).getByRole('button', { name: 'Ctrl' }));
    expect(screen.getByRole('button', { name: /&mm/ }).textContent).toContain('with Shift, RShift, Ctrl');
  });

  it('turns hold-tap options into switches under Advanced timing', async () => {
    const user = await openBehaviors();
    await create(user, '+ Hold-tap');
    const retro = screen.getByRole('switch', { name: 'Retro tap' }) as HTMLInputElement;
    await user.click(retro);
    expect(retro.checked).toBe(true);
  });

  it('jumps to the palette’s Your behaviors', async () => {
    const user = await openBehaviors();
    await create(user, '+ Tap-dance');
    await user.click(screen.getByRole('button', { name: 'Show in palette' }));
    const palette = screen.getByRole('region', { name: 'Key palette' });
    expect(within(palette).getByRole('button', { name: 'Behaviors' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(palette).getByRole('button', { name: /^Place .*td/ })).toBeTruthy();
  });
});
