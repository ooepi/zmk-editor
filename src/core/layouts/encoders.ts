import { keyBounds, KNOB_SIZE, type EncoderSpot, type PhysicalKey, type PhysicalLayout } from './types.ts';

export type Side = 'left' | 'right';

/** Space between the keys above and a knob, and between knobs side by side (1/100 key units). */
const GAP = 25;
const SPACING = 125;
/** A split needs at least this much empty space between its halves (1.5 keys). */
const MIN_SPLIT_GAP = 150;

/**
 * Which keys are the left and right half: by each key's own `side` (designed keyboards), else split
 * at the widest horizontal gap between keys, else down the middle.
 */
export function splitHalves(keys: (PhysicalKey & { side?: Side })[]): { left: number[]; right: number[] } {
  const indices = keys.map((_, i) => i);
  if (keys.some((k) => k.side)) {
    return { left: indices.filter((i) => keys[i]?.side !== 'right'), right: indices.filter((i) => keys[i]?.side === 'right') };
  }
  const spans = keys.map(keyBounds);
  const sorted = [...spans].sort((a, b) => a.left - b.left);
  let reach = sorted[0]?.right ?? 0;
  let best = { gap: 0, at: 0 };
  for (const span of sorted.slice(1)) {
    if (span.left - reach > best.gap) best = { gap: span.left - reach, at: (span.left + reach) / 2 };
    reach = Math.max(reach, span.right);
  }
  const middle = (Math.min(...spans.map((s) => s.left)) + Math.max(...spans.map((s) => s.right))) / 2;
  const at = best.gap >= MIN_SPLIT_GAP ? best.at : middle;
  const centre = (i: number) => ((spans[i]?.left ?? 0) + (spans[i]?.right ?? 0)) / 2;
  return { left: indices.filter((i) => centre(i) < at), right: indices.filter((i) => centre(i) >= at) };
}

/**
 * Every encoder's knob position: its saved spot, else under its own half (side by side when a half
 * has several), or under all keys for a one-piece keyboard or an encoder whose half isn't known.
 */
export function placeEncoders(layout: PhysicalLayout, sides: (Side | undefined)[], count: number): EncoderSpot[] {
  const halves = splitHalves(layout.keys);
  const all = layout.keys.map((_, i) => i);
  const groupOf = (i: number) => sides[i] ?? 'all';
  const keysFor = (group: Side | 'all') => (group === 'all' ? all : halves[group].length > 0 ? halves[group] : all);
  const spots: EncoderSpot[] = [];
  for (let i = 0; i < count; i++) {
    const saved = layout.encoders?.[i];
    if (saved) {
      spots.push({ x: saved.x, y: saved.y });
      continue;
    }
    const group = groupOf(i);
    const members = Array.from({ length: count }, (_, j) => j).filter((j) => groupOf(j) === group);
    const bounds = keysFor(group).map((k) => keyBounds(layout.keys[k] as PhysicalKey));
    const left = Math.min(...bounds.map((b) => b.left));
    const right = Math.max(...bounds.map((b) => b.right));
    const bottom = Math.max(...bounds.map((b) => b.bottom));
    const slot = members.indexOf(i);
    spots.push({ x: (left + right) / 2 + (slot - (members.length - 1) / 2) * SPACING, y: bottom + GAP + KNOB_SIZE / 2 });
  }
  return spots;
}

/** A knob's box, in % of a drawing `width` × `height` layout units across whose layout origin is at (originX, originY). */
export function knobBox(spot: EncoderSpot, width: number, height: number, originX: number, originY: number) {
  return {
    left: `${((spot.x - KNOB_SIZE / 2 + originX) / width) * 100}%`,
    top: `${((spot.y - KNOB_SIZE / 2 + originY) / height) * 100}%`,
    width: `${(KNOB_SIZE / width) * 100}%`,
    height: `${(KNOB_SIZE / height) * 100}%`,
  };
}
