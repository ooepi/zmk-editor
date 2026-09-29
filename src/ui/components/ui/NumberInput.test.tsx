// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NumberInput } from './NumberInput.tsx';

afterEach(cleanup);

describe('NumberInput', () => {
  it('writes the typed number once, on Enter or leaving the field', async () => {
    const user = userEvent.setup();
    const commit = vi.fn();
    render(
      <>
        <NumberInput aria-label="Term" value={200} onCommit={commit} />
        <button type="button">Elsewhere</button>
      </>,
    );
    const input = screen.getByRole('spinbutton', { name: 'Term' });
    await user.clear(input);
    await user.type(input, '280');
    expect(commit).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenLastCalledWith(280);

    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(commit).toHaveBeenLastCalledWith(undefined);
  });

  it('puts the value back on Esc, and writes nothing when it didn’t change', async () => {
    const user = userEvent.setup();
    const commit = vi.fn();
    render(<NumberInput aria-label="Term" value={200} onCommit={commit} />);
    const input = screen.getByRole('spinbutton', { name: 'Term' }) as HTMLInputElement;
    await user.type(input, '5');
    await user.keyboard('{Escape}');
    expect(input.value).toBe('200');
    await user.click(input);
    await user.keyboard('{Enter}');
    expect(commit).not.toHaveBeenCalled();
  });
});
