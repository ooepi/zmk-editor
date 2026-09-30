import { NICE_VIEW_ADAPTER, SCREEN_SHIELDS, STOCK_SCREEN_SHIELD } from '../catalog/screens.ts';
import type { ZmkConfig } from '../config.ts';
import type { BuildTarget } from '../files/build.ts';
import { parseKconfig } from '../files/kconfig.ts';
import { halfDisplay, usesNiceViewAdapter } from './displays.ts';
import { sensorOrder } from './encoders.ts';
import { interconnectOf } from './interconnects.ts';
import { remapKeyPositions, remapSensors } from './keys.ts';
import { starterKeymap } from './starter.ts';
import type { KeyboardHardware, Side } from './types.ts';

export function shieldNames(hw: KeyboardHardware): string[] {
  return hw.split ? [`${hw.name}_left`, `${hw.name}_right`] : [hw.name];
}

/** Shields for a nice!view: the adapter and a screen (ZMK's `nice_view` or one from the Screens catalog). */
const NICE_VIEW_SHIELDS = [NICE_VIEW_ADAPTER, ...SCREEN_SHIELDS];

/**
 * A target's shield list with the half's nice!view shields set: the adapter
 * and a screen, just the screen when the shield sets up the nice!view's SPI
 * bus itself (`adapter` false), or none. Other extras and a chosen screen are
 * kept; a list that already has them is returned as it is.
 */
function withDisplayShields(shield: string, niceView: boolean, adapter: boolean): string {
  const [base = '', ...rest] = shield.split(' ').filter(Boolean);
  const screen = rest.find((s) => SCREEN_SHIELDS.includes(s));
  const want = niceView ? [...(adapter ? [NICE_VIEW_ADAPTER] : []), screen ?? STOCK_SCREEN_SHIELD] : [];
  const current = rest.filter((s) => NICE_VIEW_SHIELDS.includes(s));
  if (current.length === want.length && current.every((s, i) => s === want[i])) return shield;
  const others = rest.filter((s) => !NICE_VIEW_SHIELDS.includes(s));
  return [base, ...want, ...others].join(' ');
}

const sideOf = (hw: KeyboardHardware, shield: string): Side | undefined => (hw.split ? (shield.endsWith('_right') ? 'right' : 'left') : undefined);

export function hardwareBuildTargets(hw: KeyboardHardware): BuildTarget[] {
  return shieldNames(hw).map((shield) => {
    const side = sideOf(hw, shield);
    return { board: hw.controller, shield: withDisplayShields(shield, halfDisplay(hw, side) === 'nice_view', usesNiceViewAdapter(hw, side)) };
  });
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
 * extra shields. A half with a nice!view on its own SPI bus loses a hand-added
 * `nice_view_adapter` (both would define `nice_view_spi`); on a controller the
 * adapter doesn't fit, a hand-added nice!view the model doesn't know goes too.
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
  const adapterFits = interconnectOf(hw.controller).niceViewAdapter;
  let droppedView = false;
  const include = config.build.include.map((t) => {
    const base = t.shield?.split(' ')[0] ?? '';
    if (!shields.has(base)) return t;
    // Touch the nice!view shields only when that half's nice!view (or whether it uses
    // the adapter) changed, so shields added by hand (or before displays were modelled)
    // stay as they are.
    const side = sideOf(hw, base);
    const niceView = halfDisplay(hw, side) === 'nice_view';
    const adapter = usesNiceViewAdapter(hw, side);
    const hadNiceView = config.hardware ? halfDisplay(config.hardware, side) === 'nice_view' : false;
    const hadAdapter = config.hardware ? usesNiceViewAdapter(config.hardware, side) : false;
    let shield = niceView === hadNiceView && adapter === hadAdapter ? t.shield : withDisplayShields(t.shield ?? base, niceView, adapter);
    // A nice!view on its own SPI bus can't also have the adapter; on a controller the adapter
    // doesn't fit, a nice!view the model doesn't know about (added by hand) has no SPI bus, so it goes too.
    if ((!adapterFits || (niceView && !adapter)) && shield !== undefined) {
      const fixed = withDisplayShields(shield, niceView, false);
      if (fixed !== shield) {
        shield = fixed;
        if (!niceView) droppedView = true;
      }
    }
    return { ...t, board: hw.controller, shield };
  });
  const notes = droppedView
    ? [...remapped.notes, 'Removed the nice!view from the build: on this controller it needs to be turned on under Displays, which sets up its pins.']
    : remapped.notes;
  return { config: { ...config, keymap: model, hardware: hw, build: { include } }, notes };
}
