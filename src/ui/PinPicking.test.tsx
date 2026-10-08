// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newHardwareConfig } from '../core/hardware/config.ts';
import { testShiftPad } from '../core/hardware/testFixtures.ts';
import { HardwareWizard } from './components/HardwareWizard.tsx';

afterEach(cleanup);

/** The text of a select's chosen option (the project doesn't use jest-dom). */
const shown = (label: string) => (screen.getByLabelText(label) as HTMLSelectElement).selectedOptions[0]?.textContent ?? '';
/** A pin field's card, found from its label. */
const card = (label: string) => screen.getByText(label, { selector: 'label' }).closest('.pin-card') as HTMLElement;
const isArmed = (label: string) => card(label).classList.contains('armed');
const pinout = () => screen.getByRole('figure', { name: 'Pro Micro pinout' });
const pad = (name: string) => within(pinout()).getByRole('button', { name });

// testShiftPad: rows D4, D5; columns 0–7 on U1, 8–9 on D6, D7; latch D8; data and clock D2, D3.
async function openWiring() {
  render(<HardwareWizard config={newHardwareConfig(testShiftPad, 'v0.3')} dispatch={vi.fn()} mode="edit" onDone={vi.fn()} onCancel={vi.fn()} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Next' }));
  return user;
}

describe('picking pins: field first', () => {
  it('selects a field from its card, fills it from the pinout and moves on to the next field', async () => {
    const user = await openWiring();
    await user.click(card('Row 0'));
    expect(isArmed('Row 0')).toBe(true);
    await user.click(pad('D9'));
    expect(shown('Row 0')).toBe('D9');
    expect(isArmed('Row 1')).toBe(true);
    await user.click(pad('D10'));
    expect(shown('Row 1')).toBe('D10');
    // The last row: nothing is selected after it.
    expect(document.querySelector('.pin-card.armed')).toBeNull();
  });

  it('stops when clicking empty space, or the selected card again', async () => {
    const user = await openWiring();
    await user.click(card('Row 0'));
    await user.click(document.body);
    expect(isArmed('Row 0')).toBe(false);
    await user.click(card('Row 0'));
    await user.click(card('Row 0'));
    expect(isArmed('Row 0')).toBe(false);
  });

  it('stops with Esc', async () => {
    const user = await openWiring();
    await user.click(card('Column 8'));
    await user.keyboard('{Escape}');
    expect(isArmed('Column 8')).toBe(false);
  });
});

describe('picking pins: pin first', () => {
  it('picks a pin, outlines the fields that can take it and puts it in the clicked one', async () => {
    const user = await openWiring();
    await user.click(pad('D9'));
    expect(pad('D9').getAttribute('aria-pressed')).toBe('true');
    expect(card('Column 9').classList.contains('receptive')).toBe(true);
    expect(within(pinout()).getByText('D9 picked: click a field to put it there.')).toBeTruthy();
    await user.click(card('Column 9'));
    expect(shown('Column 9')).toBe('D9');
    expect(pad('D9: Column 9').getAttribute('aria-pressed')).toBe('false');
  });

  it('only offers a shift register output to the lines it can drive', async () => {
    const user = await openWiring();
    const u1 = screen.getByRole('group', { name: 'U1' });
    await user.click(within(u1).getByRole('button', { name: 'QD, output 3: Column 3' }));
    expect(card('Row 0').classList.contains('receptive')).toBe(false);
    expect(card('Column 9').classList.contains('receptive')).toBe(true);
    await user.click(card('Column 9'));
    expect(shown('Column 9')).toMatch(/^Output 3 \(U1 QD\)/);
  });

  it('drops a picked pin when clicking empty space', async () => {
    const user = await openWiring();
    await user.click(pad('D9'));
    await user.click(document.body);
    expect(pad('D9').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('the encoder fields', () => {
  it('removes an encoder with its own button', async () => {
    const user = await openWiring();
    await user.click(screen.getByRole('button', { name: 'Add encoder' }));
    const remove = screen.getByRole('button', { name: 'Remove encoder 0' });
    expect(remove.classList.contains('icon-button')).toBe(true);
    await user.click(remove);
    expect(screen.queryByLabelText('Encoder 0 A')).toBeNull();
  });
});
