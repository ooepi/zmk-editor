// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App.tsx';
import { chooseBehavior } from './testUtils.ts';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('tap-dance and conditional layers', () => {
  it('creates a tap-dance, adds a tap and uses it on a key', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Behaviors (2)' }));
    await user.click(screen.getByRole('button', { name: 'New behavior' }));
    await user.click(screen.getByRole('button', { name: '+ Tap-dance' }));
    expect(screen.getByText('1 tap')).toBeTruthy();
    expect(screen.getByText('2 taps')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '+ Add tap' }));
    expect(screen.getByText('3 taps')).toBeTruthy();
    expect((screen.getByRole('spinbutton', { name: 'Tapping term (ms)' }) as HTMLInputElement).value).toBe('200');

    await user.click(screen.getByRole('button', { name: 'Keymap' }));
    await user.click(screen.getByRole('button', { name: 'Key 0: Esc' }));
    await chooseBehavior(user, 'td');
    expect(screen.getByRole('button', { name: 'Key 0: A (×3 td)' })).toBeTruthy();
  });

  it('adds a conditional layer from the keymap panel', async () => {
    const user = userEvent.setup();
    render(<App />);
    const panel = screen.getByRole('region', { name: 'Conditional layers' });
    await user.click(within(panel).getByRole('button', { name: '+ Conditional layer' }));
    const layers = within(panel).getByRole('group', { name: /When these layers are on/ });
    expect(within(layers).getByRole('button', { name: 'NAV' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(layers).getByRole('button', { name: 'PROG' }).getAttribute('aria-pressed')).toBe('true');
    expect((within(panel).getByRole('combobox', { name: /Turn on \(NAV \+ PROG\)/ }) as HTMLSelectElement).value).toBe('3');
    await user.selectOptions(within(panel).getByRole('combobox', { name: /Turn on/ }), '4');
    expect((within(panel).getByRole('combobox', { name: /Turn on/ }) as HTMLSelectElement).value).toBe('4');
    await user.click(within(layers).getByRole('button', { name: 'PROG' }));
    expect(within(panel).getByText('Choose at least two layers.')).toBeTruthy();
    await user.click(within(panel).getByRole('button', { name: /^Remove / }));
    expect(within(panel).queryByRole('group')).toBeNull();
  });
});
