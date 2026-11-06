// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newHardwareConfig } from '../core/hardware/config.ts';
import { testLedPad, testLedSplit } from '../core/hardware/testFixtures.ts';
import type { KeyboardHardware } from '../core/hardware/types.ts';
import { HardwareWizard } from './components/HardwareWizard.tsx';

afterEach(cleanup);

const shown = (el: HTMLElement) => (el as HTMLSelectElement).selectedOptions[0]?.textContent ?? '';
const leds = () => screen.getByRole('group', { name: 'LEDs' });

async function open(hw: KeyboardHardware, steps = 1) {
  render(<HardwareWizard config={newHardwareConfig(hw, 'v0.3')} dispatch={vi.fn()} mode="edit" onDone={vi.fn()} onCancel={vi.fn()} />);
  const user = userEvent.setup();
  for (let i = 0; i < steps; i++) await user.click(screen.getByRole('button', { name: 'Next' }));
  return user;
}

describe('the LEDs fieldset', () => {
  it('shows the keyboard’s LEDs and colours their pins on the pinout', async () => {
    await open(testLedPad);
    expect((within(leds()).getByRole('switch', { name: 'RGB underglow' }) as HTMLInputElement).checked).toBe(true);
    expect(shown(within(leds()).getByLabelText('LED data'))).toMatch(/^D10/);
    expect((within(leds()).getByLabelText('Number of LEDs') as HTMLInputElement).value).toBe('20');
    expect(shown(within(leds()).getByLabelText('LED power'))).toMatch(/^D9/);
    const pad = within(screen.getByRole('figure', { name: 'Pro Micro pinout' })).getByRole('button', { name: 'D10: LED data' });
    expect(pad.classList.contains('use-led')).toBe(true);
  });

  it('adds a backlight, and hides the power pin once both kinds are off', async () => {
    const user = await open(testLedPad);
    await user.click(within(leds()).getByRole('switch', { name: 'Backlight' }));
    expect(within(leds()).getByLabelText('Backlight pin')).toBeTruthy();
    await user.click(within(leds()).getByRole('switch', { name: 'Backlight' }));
    await user.click(within(leds()).getByRole('switch', { name: 'RGB underglow' }));
    expect(within(leds()).queryByLabelText('LED power')).toBeNull();
  });

  it('picks the LED data pin from the pinout', async () => {
    const user = await open(testLedPad);
    const card = within(leds()).getByText('LED data', { selector: 'label' }).closest('.pin-card') as HTMLElement;
    await user.click(card);
    await user.click(within(screen.getByRole('figure', { name: 'Pro Micro pinout' })).getByRole('button', { name: 'D21' }));
    expect(shown(within(leds()).getByLabelText('LED data'))).toMatch(/^D21/);
  });

  it('says the right half gets the same LEDs on a mirrored split', async () => {
    await open(testLedSplit);
    expect(screen.getByText('The right half gets the same LEDs.')).toBeTruthy();
  });

  it('summarises them on the review step', async () => {
    await open(testLedPad, 3);
    expect(screen.getByText('20 RGB LEDs on D10, power switch on D9')).toBeTruthy();
  });
});
