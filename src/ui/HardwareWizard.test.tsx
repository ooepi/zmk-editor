// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newHardwareConfig } from '../core/hardware/config.ts';
import { testPad, testShiftPad } from '../core/hardware/testFixtures.ts';
import type { EditorAction } from './state/editorReducer.ts';
import { HardwareWizard } from './components/HardwareWizard.tsx';

afterEach(() => cleanup());

describe('HardwareWizard edit mode, config changed underneath', () => {
  it('doesn’t save, and notifies instead, when config.hardware no longer matches the draft’s source', async () => {
    const config = newHardwareConfig(testPad, 'v0.3');
    const dispatch = vi.fn<(action: EditorAction) => void>();
    const onCancel = vi.fn();
    const { rerender } = render(
      <HardwareWizard config={config} dispatch={dispatch} mode="edit" onDone={vi.fn()} onCancel={onCancel} />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Simulate the config changing underneath the wizard (e.g. loaded from elsewhere).
    const changedConfig = { ...config, hardware: { ...testPad } };
    rerender(<HardwareWizard config={changedConfig} dispatch={dispatch} mode="edit" onDone={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Save hardware' }));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'notify',
      notice: 'The config changed while the wizard was open, so the hardware wasn’t saved. Open Edit hardware again.',
    });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'editConfig' }));
    expect(onCancel).toHaveBeenCalled();
  });
});

/** The text of a select's chosen option (the project doesn't use jest-dom). */
const shown = (el: HTMLElement) => (el as HTMLSelectElement).selectedOptions[0]?.textContent ?? '';

// Needs the Wiring step's shift register fields and output options; enabled with them.
describe.skip('HardwareWizard shift registers', () => {
  it('offers shift registers for a one-piece matrix and fills the columns', async () => {
    const config = newHardwareConfig(testPad, 'v0.3');
    render(<HardwareWizard config={config} dispatch={vi.fn()} mode="create" onDone={vi.fn()} onCancel={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('switch', { name: /split keyboard/i }));
    await user.clear(screen.getByLabelText('Columns'));
    await user.type(screen.getByLabelText('Columns'), '10');
    await user.selectOptions(screen.getByLabelText('Shift registers (74HC595)'), '1');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(shown(screen.getByLabelText('Column 0'))).toMatch(/^Output 0 \(U1 QA\)/);
    expect(shown(screen.getByLabelText('Column 8'))).toMatch('No pin');
  });

  it('shows the count chosen on the Wiring step when going back to Basics, and keeps it', async () => {
    const config = newHardwareConfig(testShiftPad, 'v0.3');
    render(<HardwareWizard config={config} dispatch={vi.fn()} mode="edit" onDone={vi.fn()} onCancel={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const shift = screen.getByRole('group', { name: 'Shift registers' });
    await user.selectOptions(within(shift).getByLabelText('Number of shift registers'), '2');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(shown(screen.getByLabelText('Shift registers (74HC595)'))).toMatch(/^2/);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(shown(within(screen.getByRole('group', { name: 'Shift registers' })).getByLabelText('Number of shift registers'))).toMatch(/^2/);
  });
});
