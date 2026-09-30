import { findKeycode, formatKeyExpression, KEYCODES, MODIFIER_FUNCTIONS, parseKeyExpression, preferredName, type Keycode, type ModifierFunction } from '../catalog/keycodes.ts';

/** Modifier bits from ZMK's modifiers.h; a modifier function puts them in bits 24–31. */
const MOD_BITS: Record<ModifierFunction, number> = { LC: 0x01, LS: 0x02, LA: 0x04, LG: 0x08, RC: 0x10, RS: 0x20, RA: 0x40, RG: 0x80 };

const withMods = (mods: number, usage: number) => ((mods << 24) >>> 0) + (usage & 0xffffff);

const BY_USAGE = new Map<number, Keycode>();
for (const keycode of KEYCODES) if (!BY_USAGE.has(keycode.usage)) BY_USAGE.set(keycode.usage, keycode);

/** The number ZMK Studio uses for a keycode param such as `LS(A)`; undefined if it isn't a known key. */
export function encodeKey(token: string): number | undefined {
  const expression = parseKeyExpression(token);
  const keycode = expression && findKeycode(expression.key);
  if (!expression || !keycode) return undefined;
  const mods = expression.mods.reduce((bits, mod) => bits | MOD_BITS[mod], keycode.usage >>> 24);
  return withMods(mods, keycode.usage);
}

/** The keycode token for a number from ZMK Studio, e.g. `LC(LS(TAB))`; undefined if unknown. */
export function decodeKey(value: number): string | undefined {
  const exact = BY_USAGE.get(value);
  if (exact) return preferredName(exact);
  const keycode = BY_USAGE.get(value & 0xffffff);
  if (!keycode) return undefined;
  const bits = value >>> 24;
  const mods = MODIFIER_FUNCTIONS.map((m) => m.id).filter((id) => bits & MOD_BITS[id]);
  return formatKeyExpression({ mods, key: preferredName(keycode) });
}
