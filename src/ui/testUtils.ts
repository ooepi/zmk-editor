import { screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** Picks a behavior in the searchable Behavior field by typing its ref. */
export async function chooseBehavior(user: UserEvent, ref: string, label = 'Behavior'): Promise<void> {
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.keyboard(`${ref}{Enter}`);
}
