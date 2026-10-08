/** "Display data" next to "Shift register data": one wire on a bus the two share, not a clash. */
const sharedBusPin = (uses: string[]) =>
  uses.length === 2 &&
  uses.some((u) => u.startsWith('Display ')) &&
  uses.some((u) => u.startsWith('Shift register ')) &&
  uses[0]?.split(' ').pop() === uses[1]?.split(' ').pop();

/**
 * A pad's colour class from its uses: row (or direct input), column, encoder, display, shift register, free, or a clash.
 * `sharedBus`: the shift registers share the nice!view's bus, so its data and clock pins are theirs too.
 */
export function padClass(uses: string[] | undefined, sharedBus = false): string {
  const list = uses ?? [];
  if (sharedBus && sharedBusPin(list)) return 'use-shift';
  const [first = '', second] = list;
  if (second !== undefined) return 'use-clash';
  if (first.startsWith('Row') || first.startsWith('Input')) return 'use-row';
  if (first.startsWith('Column')) return 'use-col';
  if (first.startsWith('Encoder')) return 'use-encoder';
  if (first.startsWith('Display')) return 'use-display';
  if (first.startsWith('Shift register')) return 'use-shift';
  return 'use-free';
}
