// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newHardwareConfig } from '../core/hardware/config.ts';
import { setDisplay } from '../core/hardware/displays.ts';
import { testSplit } from '../core/hardware/testFixtures.ts';
import { App } from './App.tsx';
import { reloadPreferences } from './state/preferences.ts';

beforeEach(() => {
  localStorage.clear();
  reloadPreferences();
});
afterEach(cleanup);

const card = (name: string) => screen.getByRole('article', { name });
const slotName = (label: string) => within(screen.getByLabelText(`${label} screen`)).getByRole('strong');

async function openScreens() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Screens' }));
  return user;
}

describe('nice!view screens tab', () => {
  it('credits the collection and every creator', async () => {
    await openScreens();
    expect(screen.getByRole('link', { name: 'nice-shield-collection' }).getAttribute('href')).toBe('https://github.com/whoop-t/nice-shield-collection');
    expect(within(card('Mario animation')).getByRole('link', { name: 'GPeye' }).getAttribute('href')).toBe('https://github.com/GPeye');
    expect(within(card('nice!view Elemental')).getByRole('img').getAttribute('src')).toBe('/screens/elemental.webp');
  });

  it('puts a screen on one half, sets an option and undoes it', async () => {
    const user = await openScreens();
    expect(slotName('Right').textContent).toBe('Stock nice!view');
    await user.click(within(card('One Piece: Luffy wanted poster')).getByRole('button', { name: 'Right' }));
    expect(slotName('Right').textContent).toBe('One Piece: Luffy wanted poster');
    expect(slotName('Left').textContent).toBe('Stock nice!view');
    expect(screen.getByRole('status').textContent).toMatch(/Luffy wanted poster on Right\. Build & flash/);

    // Same internal names: can't go on the other half next to it.
    const onePunchLeft = within(card('One Punch Man OK')).getByRole('button', { name: 'Left' });
    expect((onePunchLeft as HTMLButtonElement).disabled).toBe(true);
    expect(onePunchLeft.getAttribute('title')).toMatch(/share internal names/);

    const details = screen.getByRole('complementary', { name: 'One Piece: Luffy wanted poster details' });
    await user.click(within(details).getByRole('checkbox', { name: /Invert colors/ }));
    expect((within(details).getByRole('checkbox', { name: /Invert colors/ }) as HTMLInputElement).checked).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(slotName('Right').textContent).toBe('Stock nice!view');
  });

  it('uses one screen on both halves and puts the stock one back', async () => {
    const user = await openScreens();
    await user.click(within(card('nice!view Gem')).getByRole('button', { name: 'Both' }));
    expect(slotName('Left').textContent).toBe('nice!view Gem');
    expect(slotName('Right').textContent).toBe('nice!view Gem');
    await user.click(within(screen.getByLabelText('Left screen')).getByRole('button', { name: 'Back to stock' }));
    expect(slotName('Left').textContent).toBe('Stock nice!view');
    // Clicking a pressed half button turns it off too.
    await user.click(within(card('nice!view Gem')).getByRole('button', { name: 'Right' }));
    expect(slotName('Right').textContent).toBe('Stock nice!view');
  });
});

describe('Screens on a designed Seeed XIAO keyboard', () => {
  it('lists the half with a nice!view, which builds without the adapter', async () => {
    const hw = setDisplay({ ...testSplit, controller: 'seeeduino_xiao_ble' }, 'left', 'nice_view');
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config: newHardwareConfig(hw, 'v0.3') }));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Screens' }));
    expect(screen.getByLabelText('Left screen')).toBeTruthy();
    expect(screen.queryByLabelText('Right screen')).toBeNull();
  });
});
