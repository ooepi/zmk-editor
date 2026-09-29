// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App.tsx';
import { demoConfig } from './state/demo.ts';
import { reloadPreferences } from './state/preferences.ts';

beforeEach(() => {
  localStorage.clear();
  reloadPreferences();
});
afterEach(cleanup);

const welcome = () => screen.queryByRole('region', { name: 'Welcome to ZMK Editor' });

describe('the first-visit card', () => {
  it('greets a first visit and takes them to pick a keyboard, once', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(welcome()?.textContent).toContain('Lily58 demo');
    await user.click(screen.getByRole('button', { name: 'Pick your keyboard' }));
    expect(screen.getByRole('region', { name: 'Start a new config' })).toBeTruthy();

    cleanup();
    render(<App />);
    expect(welcome()).toBeNull();
  });

  it('can be dismissed to keep exploring', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Keep exploring the demo' }));
    expect(welcome()).toBeNull();
  });

  it('doesn’t greet someone who already has a config here', () => {
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config: demoConfig().config }));
    render(<App />);
    expect(welcome()).toBeNull();
  });
});
