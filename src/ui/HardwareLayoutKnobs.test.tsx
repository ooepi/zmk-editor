// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { testSplit } from '../core/hardware/testFixtures.ts';
import type { KeyboardHardware } from '../core/hardware/types.ts';
import { HardwareLayoutStep } from './components/HardwareLayoutStep.tsx';
import type { HardwareDraft } from './components/HardwareWizard.tsx';

afterEach(cleanup);

/** The step with its draft kept in state; every change is also reported to `onDraft`. */
function Harness({ hw, onDraft }: { hw: KeyboardHardware; onDraft: (hw: KeyboardHardware) => void }) {
  const [draft, setDraft] = useState<HardwareDraft>({ hw, origins: hw.keys.map((_, i) => i), encoderOrigins: [0, 1] });
  return (
    <HardwareLayoutStep
      draft={draft}
      issues={[]}
      onChange={(next) => {
        setDraft(next);
        onDraft(next.hw);
      }}
    />
  );
}

describe('encoder knobs in the keyboard wizard', () => {
  it('shows a knob per encoder and saves a moved one in the design', async () => {
    const user = userEvent.setup();
    let latest: KeyboardHardware | null = null;
    render(<Harness hw={{ ...testSplit, encoders: [{ a: 8, b: 9 }] }} onDraft={(hw) => (latest = hw)} />);
    const canvas = within(screen.getByRole('group', { name: 'Layout canvas' }));
    // Mirrored split: one encoder per half.
    expect(canvas.getAllByRole('button', { name: /^Encoder \d$/ })).toHaveLength(2);
    const right = canvas.getByRole('button', { name: 'Encoder 2' });
    const x = Number(right.querySelector('circle')?.getAttribute('cx'));
    await user.click(right);
    await user.keyboard('{ArrowRight}');
    expect((latest as KeyboardHardware | null)?.encoderSpots).toEqual([null, { x: x + 25, y: Number(right.querySelector('circle')?.getAttribute('cy')) }]);
    await user.click(screen.getByRole('button', { name: 'Default position' }));
    expect((latest as KeyboardHardware | null)?.encoderSpots).toBeUndefined();
  });
});
