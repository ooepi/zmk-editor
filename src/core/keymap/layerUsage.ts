import { behaviorCatalog, findBehavior, type BehaviorDef } from '../catalog/behaviors.ts';
import { getConditionalLayers } from './conditional.ts';
import { numericDefines, resolveLayerIndex } from './layers.ts';
import type { Binding, KeymapModel } from './model.ts';

/** How a reference turns its layer on: while held, until toggled off, instead of the others, for one key, or with other layers. */
export type LayerRefKind = 'momentary' | 'toggle' | 'to' | 'sticky' | 'conditional';

export type LayerSource =
  | { kind: 'key'; layer: number; key: number }
  | { kind: 'encoder'; layer: number; sensor: number }
  /** `all` when the combo works on every layer. */
  | { kind: 'combo'; name: string; layers: number[] | 'all' }
  | { kind: 'conditional'; name: string; ifLayers: number[] };

/** Something that turns on layer `to`, possibly one that doesn't exist. */
export interface LayerReference {
  from: LayerSource;
  to: number;
  /** The param as written, e.g. `NAV` or `1`. */
  token: string;
  behavior: string;
  /** The keymap's own behavior (tap-dance, macro…) the layer behavior sits in. */
  via?: string;
  kind: LayerRefKind;
}

export type LayerWarning =
  | { kind: 'missing-layer'; token: string; from: LayerSource }
  | { kind: 'unreachable'; layer: number }
  /** Entering the layer these ways leaves nothing on it that leads out. */
  | { kind: 'no-way-back'; layer: number; entries: LayerReference[] }
  | { kind: 'base-trans'; keys: number[] };

const KINDS: Record<string, LayerRefKind> = { mo: 'momentary', lt: 'momentary', tog: 'toggle', to: 'to', sl: 'sticky' };

type Found = Omit<LayerReference, 'from'>;

/** Walks bindings for layer behaviors, looking inside the keymap's own behaviors. */
class Finder {
  private readonly catalog: BehaviorDef[];
  private readonly defines: Map<string, number>;
  private readonly own: Map<string, Binding[]>;

  constructor(model: KeymapModel) {
    this.catalog = behaviorCatalog(model);
    this.defines = numericDefines(model);
    this.own = new Map(model.behaviors.flatMap((b) => (b.label ? [[b.label, b.bindings] as const] : [])));
  }

  resolve(token: string): number | undefined {
    return resolveLayerIndex(token, this.defines);
  }

  find(binding: Binding, via?: string, seen = new Set<string>()): Found[] {
    const def = findBehavior(this.catalog, binding.behavior);
    const found: Found[] = [];
    def?.params.forEach((type, i) => {
      const token = binding.params[i];
      const to = token === undefined || type.kind !== 'layer' ? undefined : this.resolve(token);
      if (to === undefined || token === undefined) return;
      found.push({ to, token, behavior: binding.behavior, ...(via ? { via } : {}), kind: this.kindOf(binding.behavior, i) });
    });
    const inner = this.own.get(binding.behavior);
    if (inner && !seen.has(binding.behavior)) {
      seen.add(binding.behavior);
      for (const b of inner) found.push(...this.find(b, via ?? binding.behavior, seen));
    }
    return found;
  }

  /** A custom hold-tap's layer param works like the behavior it wraps. */
  private kindOf(ref: string, param: number): LayerRefKind {
    return KINDS[ref] ?? KINDS[this.own.get(ref)?.[param]?.behavior ?? ''] ?? 'momentary';
  }
}

function comboLayers(finder: Finder, layers: string[] | undefined): number[] | 'all' {
  if (!layers || layers.length === 0) return 'all';
  return layers.map((t) => finder.resolve(t)).filter((n): n is number => n !== undefined);
}

/** Everything that turns a layer on: keys, encoders, combos and conditional layers. */
export function layerReferences(model: KeymapModel): LayerReference[] {
  const finder = new Finder(model);
  const refs: LayerReference[] = [];
  model.layers.forEach((layer, l) => {
    layer.bindings.forEach((b, key) => {
      for (const f of finder.find(b)) refs.push({ from: { kind: 'key', layer: l, key }, ...f });
    });
    layer.sensorBindings?.forEach((b, sensor) => {
      for (const f of finder.find(b)) refs.push({ from: { kind: 'encoder', layer: l, sensor }, ...f });
    });
  });
  for (const combo of model.combos) {
    const from: LayerSource = { kind: 'combo', name: combo.name, layers: comboLayers(finder, combo.layers) };
    for (const f of finder.find(combo.binding)) refs.push({ from, ...f });
  }
  for (const c of getConditionalLayers(model)) {
    const to = finder.resolve(c.thenLayer);
    if (to === undefined) continue;
    const ifLayers = c.ifLayers.map((t) => finder.resolve(t)).filter((n): n is number => n !== undefined);
    refs.push({
      from: { kind: 'conditional', name: c.name, ifLayers },
      to,
      token: c.thenLayer,
      behavior: 'conditional',
      kind: 'conditional',
    });
  }
  return refs;
}

/** Whether `from` can fire once the layers in `on` can be (or are) on. */
function sourceLive(from: LayerSource, on: (layer: number) => boolean): boolean {
  switch (from.kind) {
    case 'key':
    case 'encoder':
      return on(from.layer);
    case 'combo':
      return from.layers === 'all' || from.layers.some(on);
    case 'conditional':
      return from.ifLayers.length > 0 && from.ifLayers.every(on);
  }
}

function reachableLayers(model: KeymapModel, refs: LayerReference[]): Set<number> {
  const reached = new Set(model.layers.length > 0 ? [0] : []);
  for (let changed = true; changed;) {
    changed = false;
    for (const ref of refs) {
      if (ref.to >= model.layers.length || reached.has(ref.to) || !sourceLive(ref.from, (l) => reached.has(l))) continue;
      reached.add(ref.to);
      changed = true;
    }
  }
  return reached;
}

/** How many layer sets the way-back search looks at before giving up (and not warning). */
const SEARCH_LIMIT = 256;

/**
 * Whether, with `start` on, some key, encoder or combo leads off `target`:
 * `&to` another layer or `&tog target`, possibly after holding other layers.
 */
function hasWayBack(
  model: KeymapModel,
  finder: Finder,
  conditionals: LayerReference[],
  target: number,
  start: number[],
): boolean {
  const withConditionals = (on: Set<number>) => {
    for (let changed = true; changed;) {
      changed = false;
      for (const c of conditionals) {
        if (!on.has(c.to) && c.to < model.layers.length && sourceLive(c.from, (l) => on.has(l))) {
          on.add(c.to);
          changed = true;
        }
      }
    }
    return on;
  };
  const keyOf = (on: Set<number>) => [...on].sort((a, b) => a - b).join(',');
  const first = withConditionals(new Set(start));
  const queue = [first];
  const seen = new Set([keyOf(first)]);
  for (const on of queue) {
    if (seen.size > SEARCH_LIMIT) return true;
    const top = [...on].filter((l) => l < model.layers.length).sort((a, b) => b - a);
    const live: Binding[] = [];
    const keyCount = model.layers[0]?.bindings.length ?? 0;
    for (let key = 0; key < keyCount; key++) {
      const b = top.map((l) => model.layers[l]?.bindings[key]).find((x) => x && x.behavior !== 'trans');
      if (b) live.push(b);
    }
    const sensors = Math.max(0, ...model.layers.map((l) => l.sensorBindings?.length ?? 0));
    for (let s = 0; s < sensors; s++) {
      const b = top.map((l) => model.layers[l]?.sensorBindings?.[s]).find((x) => x && x.behavior !== 'trans');
      if (b) live.push(b);
    }
    // ZMK runs a combo when the highest active layer is one of its layers.
    for (const combo of model.combos) {
      const layers = comboLayers(finder, combo.layers);
      if (layers === 'all' || (top[0] !== undefined && layers.includes(top[0]))) live.push(combo.binding);
    }
    for (const found of live.flatMap((b) => finder.find(b))) {
      if ((found.kind === 'to' && found.to !== target) || (found.kind === 'toggle' && found.to === target)) return true;
      if ((found.kind === 'momentary' || found.kind === 'sticky') && !on.has(found.to) && found.to < model.layers.length) {
        const next = withConditionals(new Set([...on, found.to]));
        const key = keyOf(next);
        if (!seen.has(key)) {
          seen.add(key);
          queue.push(next);
        }
      }
    }
  }
  return false;
}

/** Keymap mistakes about layers: ones that don't exist, can't be reached, or can't be left. */
export function layerWarnings(model: KeymapModel): LayerWarning[] {
  const finder = new Finder(model);
  const refs = layerReferences(model);
  const count = model.layers.length;
  const warnings: LayerWarning[] = [];

  for (const ref of refs) {
    if (ref.to >= count) warnings.push({ kind: 'missing-layer', token: ref.token, from: ref.from });
  }
  for (const combo of model.combos) {
    const layers = comboLayers(finder, combo.layers);
    if (layers === 'all') continue;
    combo.layers?.forEach((token) => {
      const index = finder.resolve(token);
      if (index !== undefined && index >= count)
        warnings.push({ kind: 'missing-layer', token, from: { kind: 'combo', name: combo.name, layers } });
    });
  }

  const reached = reachableLayers(model, refs);
  for (let l = 1; l < count; l++) if (!reached.has(l)) warnings.push({ kind: 'unreachable', layer: l });

  // A layer stays on after a toggle or `&to`; one only held or turned on with others is off once let go.
  const stays = new Set([0, ...refs.filter((r) => r.kind === 'toggle' || r.kind === 'to').map((r) => r.to)]);
  const conditionals = refs.filter((r) => r.from.kind === 'conditional');
  const stuck = new Map<number, LayerReference[]>();
  for (const ref of refs) {
    if ((ref.kind !== 'to' && ref.kind !== 'toggle') || ref.to === 0 || ref.to >= count) continue;
    if (!sourceLive(ref.from, (l) => reached.has(l))) continue;
    const source = ref.kind === 'toggle' && 'layer' in ref.from && stays.has(ref.from.layer) ? [ref.from.layer] : [];
    if (!hasWayBack(model, finder, conditionals, ref.to, [0, ...source, ref.to]))
      stuck.set(ref.to, [...(stuck.get(ref.to) ?? []), ref]);
  }
  for (const [layer, entries] of [...stuck].sort(([a], [b]) => a - b)) warnings.push({ kind: 'no-way-back', layer, entries });

  const keys = model.layers[0]?.bindings.flatMap((b, i) => (b.behavior === 'trans' ? [i] : [])) ?? [];
  if (keys.length > 0) warnings.push({ kind: 'base-trans', keys });
  return warnings;
}
