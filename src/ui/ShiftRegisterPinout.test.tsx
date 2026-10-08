// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newHardwareConfig } from '../core/hardware/config.ts';
import { setShiftRegisterCount } from '../core/hardware/shiftRegisters.ts';
import { testShiftPad } from '../core/hardware/testFixtures.ts';
import type { KeyboardHardware } from '../core/hardware/types.ts';
import { HardwareWizard } from './components/HardwareWizard.tsx';

afterEach(cleanup);

/** The text of a select's chosen option (the project doesn't use jest-dom). */
const shown = (el: HTMLElement) => (el as HTMLSelectElement).selectedOptions[0]?.textContent ?? '';

async function openWiring(hw: KeyboardHardware) {
  render(<HardwareWizard config={newHardwareConfig(hw, 'v0.3')} dispatch={vi.fn()} mode="edit" onDone={vi.fn()} onCancel={vi.fn()} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Next' }));
  return user;
}

describe('the shift register pinout', () => {
  it('draws each 74HC595 with its outputs’ uses and its fixed wiring', async () => {
    await openWiring(setShiftRegisterCount(testShiftPad, 2));
    const figure = screen.getByRole('figure', { name: 'Shift register pinout' });
    const u1 = within(figure).getByRole('group', { name: 'U1' });
    expect(within(u1).getByRole('button', { name: 'QA, output 0: Column 0' })).toBeTruthy();
    expect(within(u1).getByRole('button', { name: 'QH, output 7: Column 7' })).toBeTruthy();
    expect(within(u1).getByText('Latch · D8')).toBeTruthy();
    expect(within(u1).getByText('Data · D2')).toBeTruthy();
    expect(within(u1).getByText('Clock · D3')).toBeTruthy();
    expect(within(u1).getByText('To U2 SER')).toBeTruthy();
    const u2 = within(figure).getByRole('group', { name: 'U2' });
    expect(within(u2).getByRole('button', { name: 'QA, output 8' })).toBeTruthy();
    expect(within(u2).getByText('Not used')).toBeTruthy();
    // Power and fixed pins aren't pickable.
    expect(within(u1).queryByRole('button', { name: /VCC|GND|OE|SRCLR/ })).toBeNull();
  });

  it('fills an armed column with the clicked output', async () => {
    const user = await openWiring(testShiftPad);
    await user.click(screen.getByLabelText('Column 9'));
    const u1 = screen.getByRole('group', { name: 'U1' });
    await user.click(within(u1).getByRole('button', { name: 'QD, output 3: Column 3' }));
    expect(shown(screen.getByLabelText('Column 9'))).toMatch(/^Output 3 \(U1 QD\)/);
  });

  it('ignores an output click while an input line is armed', async () => {
    const user = await openWiring(testShiftPad);
    await user.click(screen.getByLabelText('Row 0'));
    await user.click(within(screen.getByRole('group', { name: 'U1' })).getByRole('button', { name: 'QD, output 3: Column 3' }));
    expect(shown(screen.getByLabelText('Row 0'))).toMatch(/^D4/);
  });

  it('isn’t shown without shift registers', async () => {
    await openWiring(setShiftRegisterCount(testShiftPad, 0));
    expect(screen.queryByRole('figure', { name: 'Shift register pinout' })).toBeNull();
  });
});

describe('the controller pinout', () => {
  it('writes the chip’s pin names on the board, outside the pin buttons', async () => {
    await openWiring(testShiftPad);
    const figure = screen.getByRole('figure', { name: 'Pro Micro pinout' });
    expect(within(figure).getByRole('button', { name: 'D4: Row 0' })).toBeTruthy();
    expect(within(figure).getByText('P0.22').closest('button')).toBeNull();
  });
});
