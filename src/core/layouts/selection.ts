import type { PhysicalKey } from './types.ts';

/** A rectangle given by two opposite corners, in either order (1/100 key units). */
export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** The axis-aligned outline of a key, rotated around (rx, ry) when it has a rotation. */
function keyBounds(k: PhysicalKey): { left: number; top: number; right: number; bottom: number } {
  const corners = [
    [k.x, k.y],
    [k.x + k.w, k.y],
    [k.x, k.y + k.h],
    [k.x + k.w, k.y + k.h],
  ].map(([x = 0, y = 0]) => {
    if (!k.r) return [x, y] as const;
    const a = (k.r * Math.PI) / 180;
    const dx = x - k.rx;
    const dy = y - k.ry;
    return [k.rx + dx * Math.cos(a) - dy * Math.sin(a), k.ry + dx * Math.sin(a) + dy * Math.cos(a)] as const;
  });
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/** Indices of the keys whose outline overlaps the box. */
export function keysInBox(keys: PhysicalKey[], box: Box): number[] {
  const left = Math.min(box.x1, box.x2);
  const right = Math.max(box.x1, box.x2);
  const top = Math.min(box.y1, box.y2);
  const bottom = Math.max(box.y1, box.y2);
  return keys.flatMap((k, i) => {
    const b = keyBounds(k);
    return b.left < right && b.right > left && b.top < bottom && b.bottom > top ? [i] : [];
  });
}

/** Moves the given keys by (dx, dy); a rotated key's rotation origin moves with it. */
export function moveKeys(keys: PhysicalKey[], indices: number[], dx: number, dy: number): PhysicalKey[] {
  const moving = new Set(indices);
  return keys.map((k, i) => {
    if (!moving.has(i)) return k;
    const moved = { ...k, x: k.x + dx, y: k.y + dy };
    return k.r ? { ...moved, rx: k.rx + dx, ry: k.ry + dy } : moved;
  });
}
