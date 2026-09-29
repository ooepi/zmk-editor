// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App.tsx';
import { chooseBehavior } from './testUtils.ts';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('combos, encoders, behaviors and macros', () => {
  it('creates a combo by clicking keys', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Combos (0)' }));
    await user.click(screen.getByRole('button', { name: '+ New combo' }));
    expect(screen.getByText('A combo needs at least two keys.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Key 13: Q' }));
    await user.click(screen.getByRole('button', { name: 'Key 14: W' }));
    expect(screen.getByRole('button', { name: 'Key 13: Q' }).className).toContain('highlighted');
    expect(screen.queryByText('A combo needs at least two keys.')).toBeNull();
    await user.click(screen.getAllByRole('button', { name: 'Done' })[0] as HTMLElement);
    const item = within(screen.getByRole('list', { name: 'Combos' })).getByRole('button');
    expect(item.textContent).toMatch(/Q\+W→Esc/);

    await user.click(item);
    await user.click(screen.getByRole('button', { name: 'NAV' }));
    expect(screen.getByRole('button', { name: 'NAV' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('changes what the encoder does on a layer', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Encoder 1: Vol- / Vol+' }));
    expect(screen.getByRole('heading', { name: 'Encoder 1 · BASE' })).toBeTruthy();
    await user.type(screen.getByRole('searchbox', { name: 'Search keys for Counter-clockwise' }), 'pg_dn{Enter}');
    expect(screen.getByRole('button', { name: 'Encoder 1: PgDn / Vol+' })).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: /NAV/ }));
    expect(screen.getByRole('button', { name: 'Encoder 1: Wh ↑ / Wh ↓' })).toBeTruthy();
  });

  it('creates and renames a hold-tap, then uses it on a key', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Behaviors (2)' }));
    await user.click(screen.getByRole('button', { name: '+ Hold-tap' }));
    const name = screen.getByRole('textbox', { name: 'Name (use it as &name)' });
    await user.clear(name);
    await user.type(name, 'kp{Enter}');
    expect(screen.getByText('&kp is a built-in ZMK behavior.')).toBeTruthy();
    await user.clear(name);
    await user.type(name, 'hm{Enter}');
    expect(screen.getByRole('button', { name: /&hm/ })).toBeTruthy();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Flavor' }), 'tap-preferred');
    await user.click(screen.getByRole('button', { name: 'Keymap' }));
    await user.click(screen.getByRole('button', { name: 'Key 0: Esc' }));
    await chooseBehavior(user, 'hm');
    expect(screen.getByRole('button', { name: 'Key 0: A (Esc)' })).toBeTruthy();
  });

  it('builds a macro from text', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Macros (0)' }));
    await user.click(screen.getByRole('button', { name: '+ New macro' }));
    await user.type(screen.getByRole('textbox', { name: 'Text to type' }), 'Yo ä{Enter}');
    const steps = within(screen.getByRole('list', { name: 'Macro steps' })).getAllByRole('listitem');
    expect(steps).toHaveLength(4);
    expect(steps[1]?.textContent).toContain('Sft+Y');
    expect(screen.getByText(/Skipped characters .*: ä/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Remove step 1' }));
    expect(within(screen.getByRole('list', { name: 'Macro steps' })).getAllByRole('listitem')).toHaveLength(3);
  });
});
