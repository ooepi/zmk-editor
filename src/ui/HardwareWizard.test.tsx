// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newHardwareConfig } from '../core/hardware/config.ts';
import { testPad } from '../core/hardware/testFixtures.ts';
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
