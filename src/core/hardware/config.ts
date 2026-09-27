import type { ZmkConfig } from '../config.ts';
import type { BuildTarget } from '../files/build.ts';
import { parseKconfig } from '../files/kconfig.ts';
import { remapKeyPositions } from './keys.ts';
import { starterKeymap } from './starter.ts';
import type { KeyboardHardware } from './types.ts';

export function shieldNames(hw: KeyboardHardware): string[] {
  return hw.split ? [`${hw.name}_left`, `${hw.name}_right`] : [hw.name];
}

export function hardwareBuildTargets(hw: KeyboardHardware): BuildTarget[] {
  return shieldNames(hw).map((shield) => ({ board: hw.controller, shield }));
}

/** A fresh config for a keyboard designed in the editor. */
export function newHardwareConfig(hw: KeyboardHardware, zmkVersion: string): ZmkConfig {
  return {
    keyboard: hw.name,
    keymap: starterKeymap(hw),
    kconfig: parseKconfig(''),
    west: { zmkVersion, modules: [], selfPath: 'config' },
    build: { include: hardwareBuildTargets(hw) },
    hardware: hw,
  };
}

/**
 * Applies edited hardware. `newToOld[i]` is the old index of key `i`
 * (undefined for added keys); the keymap and combos follow. The keyboard's
 * build targets move to the new controller, keeping their extra shields.
 */
export function applyHardware(config: ZmkConfig, hw: KeyboardHardware, newToOld: (number | undefined)[]): { config: ZmkConfig; notes: string[] } {
  const { model, notes } = remapKeyPositions(config.keymap, newToOld);
  const shields = new Set(shieldNames(hw));
  const include = config.build.include.map((t) => (shields.has(t.shield?.split(' ')[0] ?? '') ? { ...t, board: hw.controller } : t));
  return { config: { ...config, keymap: model, hardware: hw, build: { include } }, notes };
}
