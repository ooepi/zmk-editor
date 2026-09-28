import type { ZmkConfig } from '../config.ts';
import type { BuildTarget } from '../files/build.ts';
import { parseKconfig } from '../files/kconfig.ts';
import { halfDisplay } from './displays.ts';
import { sensorOrder } from './encoders.ts';
import { remapKeyPositions, remapSensors } from './keys.ts';
import { starterKeymap } from './starter.ts';
import type { KeyboardHardware, Side } from './types.ts';

export function shieldNames(hw: KeyboardHardware): string[] {
  return hw.split ? [`${hw.name}_left`, `${hw.name}_right`] : [hw.name];
}

/** Shields ZMK and modules use for a nice!view; `nice_view_gem` (a module) takes the place of `nice_view`. */
const NICE_VIEW_SHIELDS = ['nice_view_adapter', 'nice_view', 'nice_view_gem'];

/** A target's shield list with the half's nice!view shields added or removed; other extras are kept. */
function withDisplayShields(shield: string, niceView: boolean): string {
  const [base = '', ...rest] = shield.split(' ').filter(Boolean);
  const hasView = rest.includes('nice_view_adapter') && (rest.includes('nice_view') || rest.includes('nice_view_gem'));
  if (niceView ? hasView : !rest.some((s) => NICE_VIEW_SHIELDS.includes(s))) return shield;
  const others = rest.filter((s) => !NICE_VIEW_SHIELDS.includes(s));
  const view = niceView ? ['nice_view_adapter', rest.includes('nice_view_gem') ? 'nice_view_gem' : 'nice_view'] : [];
  return [base, ...view, ...others].join(' ');
}

const sideOf = (hw: KeyboardHardware, shield: string): Side | undefined => (hw.split ? (shield.endsWith('_right') ? 'right' : 'left') : undefined);

export function hardwareBuildTargets(hw: KeyboardHardware): BuildTarget[] {
  return shieldNames(hw).map((shield) => ({ board: hw.controller, shield: withDisplayShields(shield, halfDisplay(hw, sideOf(hw, shield)) === 'nice_view') }));
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
 * (undefined for added keys), and `sensorNewToOld` the same for encoders
 * in sensor order; the keymap, combos and sensor bindings follow. The
 * keyboard's build targets move to the new controller, keeping their
 * extra shields.
 */
export function applyHardware(
  config: ZmkConfig,
  hw: KeyboardHardware,
  newToOld: (number | undefined)[],
  sensorNewToOld: (number | undefined)[] = sensorOrder(hw).map((_, i) => i),
): { config: ZmkConfig; notes: string[] } {
  const remapped = remapKeyPositions(config.keymap, newToOld);
  const model = remapSensors(remapped.model, sensorNewToOld);
  const shields = new Set(shieldNames(hw));
  const include = config.build.include.map((t) => {
    const base = t.shield?.split(' ')[0] ?? '';
    if (!shields.has(base)) return t;
    // Touch the nice!view shields only when that half's nice!view changed, so
    // shields added by hand (or before displays were modelled) stay as they are.
    const side = sideOf(hw, base);
    const niceView = halfDisplay(hw, side) === 'nice_view';
    const hadNiceView = config.hardware ? halfDisplay(config.hardware, side) === 'nice_view' : false;
    const shield = niceView === hadNiceView ? t.shield : withDisplayShields(t.shield ?? base, niceView);
    return { ...t, board: hw.controller, shield };
  });
  return { config: { ...config, keymap: model, hardware: hw, build: { include } }, notes: remapped.notes };
}
