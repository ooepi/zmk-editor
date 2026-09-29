// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Switch } from './Switch.tsx';

afterEach(cleanup);

function Harness() {
  const [on, setOn] = useState(false);
  return <Switch checked={on} onChange={setOn} aria-label="Retro tap" />;
}

describe('Switch', () => {
  it('is a named switch that toggles', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const toggle = screen.getByRole('switch', { name: 'Retro tap' }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    await user.click(toggle);
    expect(toggle.checked).toBe(true);
  });
});
