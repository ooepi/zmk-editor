import type { PhysicalKey, PhysicalLayout } from './types.ts';

/**
 * A layout shifted so no key's x or y is negative, with rx/ry (for rotated
 * keys) shifted along, and every cell rounded to an integer. `dtc` rejects an
 * unparenthesised negative number and a non-integer in `key_physical_attrs`,
 * so generated output always goes through this first.
 */
export function normalizedLayout(layout: PhysicalLayout): PhysicalLayout {
  const minX = Math.min(0, ...layout.keys.map((k) => k.x));
  const minY = Math.min(0, ...layout.keys.map((k) => k.y));
  const dx = -minX;
  const dy = -minY;
  const keys: PhysicalKey[] = layout.keys.map((k) => ({
    x: Math.round(k.x + dx),
    y: Math.round(k.y + dy),
    w: Math.round(k.w),
    h: Math.round(k.h),
    r: k.r,
    rx: Math.round(k.r !== 0 ? k.rx + dx : k.rx),
    ry: Math.round(k.r !== 0 ? k.ry + dy : k.ry),
  }));
  return { name: layout.name, keys };
}
