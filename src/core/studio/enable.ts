import type { ZmkConfig } from '../config.ts';
import type { DtNode } from '../dts/ast.ts';
import type { BuildTarget } from '../files/build.ts';
import type { KeymapModel } from '../keymap/model.ts';

/** The Zephyr snippet that lets ZMK Studio talk over USB. */
export const STUDIO_SNIPPET = 'studio-rpc-usb-uart';
export const STUDIO_CMAKE_ARG = '-DCONFIG_ZMK_STUDIO=y';

const args = (target: BuildTarget) => (target.cmakeArgs ?? '').split(/\s+/).filter(Boolean);
const hasStudio = (target: BuildTarget) => target.snippet === STUDIO_SNIPPET && args(target).includes(STUDIO_CMAKE_ARG);

/** The build target Studio goes on: the central (left) half of a split, else the only keyboard target. */
export function centralTarget(targets: BuildTarget[]): number {
  const halves = targets.map((t) => (t.shield ?? '').split(/\s+/));
  const left = halves.findIndex((shields) => shields.some((s) => s.endsWith('_left')));
  if (left >= 0) return left;
  const keyboards = targets.flatMap((t, i) => ((t.shield ?? '').includes('settings_reset') ? [] : [i]));
  return keyboards[0] ?? -1;
}

/** Studio is on when a build target has both the snippet and the Kconfig flag. */
export function studioEnabled(config: Pick<ZmkConfig, 'build'>): boolean {
  return config.build.include.some(hasStudio);
}

export function spareLayers(config: Pick<ZmkConfig, 'keymap'>): number {
  return config.keymap.reservedLayers?.length ?? 0;
}

/** A spare layer: only `status = "reserved"`, so it's safe to remove again. */
const isEmptySpare = (node: DtNode) => node.children.length === 0 && node.properties.every((p) => p.name === 'status');

function withSpares(keymap: KeymapModel, count: number): KeymapModel {
  const current = keymap.reservedLayers ?? [];
  const taken = new Set([...keymap.layers.map((l) => l.name), ...current.map((n) => n.name)]);
  const next = [...current];
  for (let n = 1; next.length < count; n++) {
    const name = `extra_${n}`;
    if (taken.has(name)) continue;
    next.push({ name, labels: [], properties: [{ name: 'status', values: [{ kind: 'string', value: 'reserved' }] }], children: [] });
  }
  // Fewer spares: drop empty ones from the end; ones with content stay.
  for (let i = next.length - 1; i >= 0 && next.length > count; i--) {
    const node = next[i];
    if (node && isEmptySpare(node)) next.splice(i, 1);
  }
  const { reservedLayers: _, ...rest } = keymap;
  return next.length > 0 ? { ...rest, reservedLayers: next } : rest;
}

/** Turns ZMK Studio on for the central half and keeps `spare` spare layers for it. */
export function enableStudio(config: ZmkConfig, spare: number): ZmkConfig {
  const central = centralTarget(config.build.include);
  const include = config.build.include.map((target, i) => {
    if (i !== central || hasStudio(target)) return target;
    const cmakeArgs = [...args(target).filter((a) => a !== STUDIO_CMAKE_ARG), STUDIO_CMAKE_ARG].join(' ');
    return { ...target, snippet: STUDIO_SNIPPET, cmakeArgs };
  });
  return { ...config, build: { include }, keymap: withSpares(config.keymap, spare) };
}

/** Turns ZMK Studio off: removes its build options and the empty spare layers. */
export function disableStudio(config: ZmkConfig): ZmkConfig {
  const include = config.build.include.map((target) => {
    const next: BuildTarget = { ...target };
    if (next.snippet === STUDIO_SNIPPET) delete next.snippet;
    const rest = args(target).filter((a) => a !== STUDIO_CMAKE_ARG);
    if (rest.length > 0) next.cmakeArgs = rest.join(' ');
    else delete next.cmakeArgs;
    return next;
  });
  return { ...config, build: { include }, keymap: withSpares(config.keymap, 0) };
}

/** Whether a key anywhere unlocks the keyboard for Studio. */
export function hasUnlockKey(keymap: KeymapModel): boolean {
  return keymap.layers.some((l) => l.bindings.some((b) => b.behavior === 'studio_unlock')) || keymap.combos.some((c) => c.binding.behavior === 'studio_unlock');
}
