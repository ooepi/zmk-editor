import { useRef, useState, type DragEvent } from 'react';

/**
 * Where an item ends up when dragged from `from` and dropped before (or
 * `after`) the item at `over`, as an index into the list after the move.
 */
export function reorderTarget(from: number, over: number, after: boolean): number {
  const insertAt = over + (after ? 1 : 0);
  return from < insertAt ? insertAt - 1 : insertAt;
}

/**
 * The gap a drop lands in: 0 is before the first item, `n` after the last. The lower half of
 * one item and the upper half of the next are the same gap. Null when the drop wouldn't move
 * the dragged item (the gaps on either side of it), so no line is shown.
 */
export function dropGap(drop: { index: number; after: boolean } | null, dragging: number | null): number | null {
  if (!drop) return null;
  const gap = drop.index + (drop.after ? 1 : 0);
  return dragging !== null && (gap === dragging || gap === dragging + 1) ? null : gap;
}

/** A copy of the list with the item at `from` moved to `to`. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(to, 0, item);
  return next;
}

/**
 * Drag-to-reorder for one list. Each list uses its own drag type, so items
 * can't be dropped into another list (or onto keys and layer tabs).
 */
export function useReorder(list: string, onMove: (from: number, to: number) => void) {
  const type = `application/x-zmk-reorder-${list}`;
  const [drop, setDrop] = useState<{ index: number; after: boolean } | null>(null);
  /** The item being dragged from this list, to hide lines that wouldn't move it. */
  const dragging = useRef<number | null>(null);
  const carries = (event: DragEvent) => Array.from(event.dataTransfer.types).includes(type);

  /** Makes an element start the drag: the whole item, or just its handle. */
  const handle = (index: number) => ({
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.stopPropagation();
      event.dataTransfer.setData(type, String(index));
      event.dataTransfer.effectAllowed = 'move';
      dragging.current = index;
    },
    onDragEnd: () => {
      dragging.current = null;
      setDrop(null);
    },
  });

  /** Makes an element a drop target; the drop line goes on the side nearer the pointer. */
  const target = (index: number, axis: 'x' | 'y' = 'y') => ({
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!carries(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = event.currentTarget.getBoundingClientRect();
      const after = axis === 'y' ? event.clientY > rect.top + rect.height / 2 : event.clientX > rect.left + rect.width / 2;
      if (drop?.index !== index || drop.after !== after) setDrop({ index, after });
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrop(null);
    },
    onDrop: (event: DragEvent) => {
      if (!carries(event)) return;
      event.preventDefault();
      const from = Number(event.dataTransfer.getData(type));
      const after = drop?.index === index && drop.after;
      setDrop(null);
      if (!Number.isInteger(from)) return;
      const to = reorderTarget(from, index, after);
      if (to !== from) onMove(from, to);
    },
  });

  /**
   * One line per gap: ` drop-before` on the item after the gap, or ` drop-after` on the last
   * item for the gap at the end. Pass whether `index` is the list's last item.
   */
  const dropClass = (index: number, last = false) => {
    const gap = dropGap(drop, dragging.current);
    if (gap === index) return ' drop-before';
    return last && gap === index + 1 ? ' drop-after' : '';
  };

  return { handle, target, dropClass };
}
