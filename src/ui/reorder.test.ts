import { describe, expect, it } from 'vitest';
import { dropGap, moveItem, reorderTarget } from './reorder.ts';

describe('reorderTarget', () => {
  it('moves an item down, before or after the one it is dropped on', () => {
    expect(reorderTarget(0, 2, false)).toBe(1);
    expect(reorderTarget(0, 2, true)).toBe(2);
  });

  it('moves an item up, before or after the one it is dropped on', () => {
    expect(reorderTarget(3, 1, false)).toBe(1);
    expect(reorderTarget(3, 1, true)).toBe(2);
  });

  it('keeps the position when dropped on itself or its neighbour edge', () => {
    expect(reorderTarget(2, 2, false)).toBe(2);
    expect(reorderTarget(2, 2, true)).toBe(2);
    expect(reorderTarget(2, 1, true)).toBe(2);
    expect(reorderTarget(2, 3, false)).toBe(2);
  });
});

describe('moveItem', () => {
  it('moves one item and leaves the input alone', () => {
    const list = ['a', 'b', 'c', 'd'];
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(list, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(list).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('dropGap', () => {
  it('treats the lower half of one item and the upper half of the next as one gap', () => {
    expect(dropGap({ index: 1, after: true }, 4)).toBe(2);
    expect(dropGap({ index: 2, after: false }, 4)).toBe(2);
    expect(dropGap({ index: 3, after: true }, 0)).toBe(4);
  });

  it('shows no gap beside the dragged item, where the drop would not move it', () => {
    expect(dropGap({ index: 2, after: false }, 2)).toBeNull();
    expect(dropGap({ index: 2, after: true }, 2)).toBeNull();
    expect(dropGap({ index: 1, after: true }, 2)).toBeNull();
    expect(dropGap(null, 2)).toBeNull();
  });
});
