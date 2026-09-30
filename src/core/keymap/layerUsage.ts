import { behaviorCatalog, type BehaviorDef } from '../catalog/behaviors.ts';
import { getConditionalLayers } from './conditional.ts';
import type { Behavior, Binding, KeymapModel } from './model.ts';

/** How a reference turns its layer on: while held, until toggled off, instead of the others, for one key, or with other layers. */
export type LayerRefKind = 'momentary' | 'toggle' | 'to' | 'sticky' | 'conditional';

export type LayerSource =
  | { kind: 'key'; layer: number; key: number }
  | { kind: 'encoder'; layer: number; sensor: number }
  /** `all` when the combo works on every layer (or names layers we can't resolve). */
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
  /** A toggle with `toggle-mode`: `on` only turns the layer on, `off` only turns it off. */
  mode?: 'on' | 'off';
}

export type LayerWarning =
  | { kind: 'missing-layer'; token: string; from: LayerSource }
  /** Layer names defined outside the keymap (e.g. in an included header): reachability isn't checked. */
  | { kind: 'unresolved'; tokens: string[] }
  | { kind: 'unreachable'; layer: number }
  /** Entering the layer these ways leaves nothing on it that leads out. */
  | { kind: 'no-way-back'; layer: number; entries: LayerReference[] }
  | { kind: 'base-trans'; keys: number[] };

const KINDS: Record<string, LayerRefKind> = { mo: 'momentary', lt: 'momentary', tog: 'toggle', to: 'to', sl: 'sticky' };

/** The keymap's own layer behaviors, by compatible; their first param is the layer. */
const LAYER_COMPATIBLES: Record<string, LayerRefKind> = {
  'zmk,behavior-momentary-layer': 'momentary',
  'zmk,behavior-toggle-layer': 'toggle',
  'zmk,behavior-to-layer': 'to',
};

const MACROS = new Set(['zmk,behavior-macro', 'zmk,behavior-macro-one-param', 'zmk,behavior-macro-two-param']);
const PLACEHOLDER = 'MACRO_PLACEHOLDER';

type Found = Omit<LayerReference, 'from'>;

/** Integer `#define`s, following ones that name another (`#define NAV L_NAV`). */
function layerDefines(model: KeymapModel): Map<string, number> {
  const raw = new Map<string, string>();
  for (const item of model.topLevel) if (item.kind === 'define' && !item.params) raw.set(item.name, item.value.trim());
  const resolved = new Map<string, number>();
  for (const name of raw.keys()) {
    let value = raw.get(name);
    for (let hops = 0; value !== undefined && hops < 8 && !/^\d+$/.test(value); hops++) value = raw.get(value);
    if (value !== undefined && /^\d+$/.test(value)) resolved.set(name, Number(value));
  }
  return resolved;
}

function stringProperty(behavior: Behavior, name: string): string | undefined {
  const value = behavior.properties.find((p) => p.name === name)?.values[0];
  return value?.kind === 'string' ? value.value : undefined;
}

/** Walks bindings for layer behaviors, looking inside the keymap's own behaviors. */
class Finder {
  /** Layer names that couldn't be resolved, in the order met. */
  readonly unresolved = new Set<string>();
  private readonly defs = new Map<string, BehaviorDef>();
  private readonly defines: Map<string, number>;
  private readonly own = new Map<string, Behavior>();
  private readonly ownLayer = new Map<string, { kind: LayerRefKind; mode?: 'on' | 'off' }>();
  private readonly cache = new WeakMap<Binding, Found[]>();

  constructor(model: KeymapModel) {
    for (const def of behaviorCatalog(model)) if (!this.defs.has(def.ref)) this.defs.set(def.ref, def);
    this.defines = layerDefines(model);
    for (const b of model.behaviors) if (b.label) this.own.set(b.label, b);
    for (const [label, b] of this.own) {
      const mode = stringProperty(b, 'toggle-mode');
      const kind = LAYER_COMPATIBLES[b.compatible];
      if (kind) this.ownLayer.set(label, { kind, ...(kind === 'toggle' && (mode === 'on' || mode === 'off') ? { mode } : {}) });
      // A sticky key wrapping `&mo` is a sticky layer (ZMK's own `&sl` is one).
      else if (b.compatible === 'zmk,behavior-sticky-key' && KINDS[b.bindings[0]?.behavior ?? ''])
        this.ownLayer.set(label, { kind: 'sticky' });
    }
  }

  resolve(token: string): number | undefined {
    if (/^\d+$/.test(token)) return Number(token);
    return this.defines.get(token);
  }

  /** Resolves a layer name, noting it when it can't be. */
  layer(token: string): number | undefined {
    const index = this.resolve(token);
    if (index === undefined && token !== PLACEHOLDER) this.unresolved.add(token);
    return index;
  }

  find(binding: Binding): Found[] {
    let found = this.cache.get(binding);
    if (!found) {
      found = this.walk(binding, undefined, new Set());
      this.cache.set(binding, found);
    }
    return found;
  }

  private walk(binding: Binding, via: string | undefined, seen: Set<string>): Found[] {
    const found: Found[] = [];
    const push = (token: string, kind: LayerRefKind, mode?: 'on' | 'off') => {
      const to = this.layer(token);
      if (to !== undefined)
        found.push({ to, token, behavior: binding.behavior, ...(via ? { via } : {}), kind, ...(mode ? { mode } : {}) });
    };

    const ownLayer = this.ownLayer.get(binding.behavior);
    const token0 = binding.params[0];
    if (ownLayer) {
      if (token0 !== undefined) push(token0, ownLayer.kind, ownLayer.mode);
      return found;
    }
    this.defs.get(binding.behavior)?.params.forEach((type, i) => {
      const token = binding.params[i];
      if (type.kind === 'layer' && token !== undefined) push(token, this.kindOf(binding.behavior, i));
    });

    const own = this.own.get(binding.behavior);
    if (!own || seen.has(binding.behavior)) return found;
    const inner = new Set([...seen, binding.behavior]);
    const through = via ?? binding.behavior;
    // Parameterised macros hand their params to the next binding: `&macro_param_1to1` then `&mo MACRO_PLACEHOLDER`.
    let pass: [from: number, to: number][] = [];
    for (const b of own.bindings) {
      const param = MACROS.has(own.compatible) ? /^macro_param_(\d)to(\d)$/.exec(b.behavior) : null;
      if (param) {
        pass.push([Number(param[1]) - 1, Number(param[2]) - 1]);
        continue;
      }
      let next = b;
      if (pass.length > 0) {
        const params = [...b.params];
        for (const [from, to] of pass)
          if (params[to] === PLACEHOLDER && binding.params[from] !== undefined) params[to] = binding.params[from];
        next = { ...b, params };
        pass = [];
      }
      found.push(...this.walk(next, through, inner));
    }
    return found;
  }

  /** A custom hold-tap's layer param works like the behavior it wraps. */
  private kindOf(ref: string, param: number): LayerRefKind {
    const wrapped = this.own.get(ref)?.bindings[param]?.behavior ?? '';
    return KINDS[ref] ?? KINDS[wrapped] ?? this.ownLayer.get(wrapped)?.kind ?? 'momentary';
  }
}

/** Resolved combo layers; unresolvable names make it `all`, since we can't tell. */
function comboLayers(finder: Finder, layers: string[] | undefined): number[] | 'all' {
  if (!layers || layers.length === 0) return 'all';
  const resolved = layers.map((t) => finder.layer(t));
  return resolved.every((n) => n !== undefined) ? (resolved as number[]) : 'all';
}

function collect(model: KeymapModel, finder: Finder): LayerReference[] {
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
    const ifLayers = c.ifLayers.map((t) => finder.layer(t));
    const to = finder.layer(c.thenLayer);
    if (to === undefined || ifLayers.some((n) => n === undefined)) continue;
    refs.push({
      from: { kind: 'conditional', name: c.name, ifLayers: ifLayers as number[] },
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
  const entries = refs.filter((r) => r.mode !== 'off' && r.to < model.layers.length);
  for (let changed = true; changed;) {
    changed = false;
    for (const ref of entries) {
      if (reached.has(ref.to) || !sourceLive(ref.from, (l) => reached.has(l))) continue;
      reached.add(ref.to);
      changed = true;
    }
  }
  return reached;
}

/** How many layer sets one way-back search looks at before giving up (and not warning). */
const SEARCH_LIMIT = 64;

/** Searches, from a set of active layers, for a way off a layer. */
class WayBack {
  private readonly memo = new Map<string, boolean>();
  private readonly keyCount: number;
  private readonly sensorCount: number;
  private readonly combos: { layers: number[] | 'all'; binding: Binding }[];
  private readonly thenLayers: Set<number>;
  private readonly model: KeymapModel;
  private readonly finder: Finder;
  private readonly conditionals: LayerReference[];

  constructor(model: KeymapModel, finder: Finder, conditionals: LayerReference[]) {
    this.model = model;
    this.finder = finder;
    this.conditionals = conditionals;
    this.keyCount = model.layers[0]?.bindings.length ?? 0;
    this.sensorCount = Math.max(0, ...model.layers.map((l) => l.sensorBindings?.length ?? 0));
    this.combos = model.combos.map((c) => ({ layers: comboLayers(finder, c.layers), binding: c.binding }));
    this.thenLayers = new Set(conditionals.map((c) => c.to));
  }

  /** ZMK turns each conditional layer on exactly when all of its if-layers are on. */
  private settle(on: Set<number>): Set<number> {
    const next = new Set([...on].filter((l) => !this.thenLayers.has(l) && l < this.model.layers.length));
    for (let changed = true; changed;) {
      changed = false;
      for (const c of this.conditionals) {
        if (!next.has(c.to) && sourceLive(c.from, (l) => next.has(l))) {
          next.add(c.to);
          changed = true;
        }
      }
    }
    return next;
  }

  /** Bindings in effect: each key's from the highest active layer that isn't `&trans`, and the combos that run. */
  private live(on: Set<number>): Binding[] {
    const top = [...on].sort((a, b) => b - a);
    const { layers } = this.model;
    const live: Binding[] = [];
    for (let key = 0; key < this.keyCount; key++) {
      for (const l of top) {
        const b = layers[l]?.bindings[key];
        if (b && b.behavior !== 'trans') {
          live.push(b);
          break;
        }
      }
    }
    for (let s = 0; s < this.sensorCount; s++) {
      for (const l of top) {
        const b = layers[l]?.sensorBindings?.[s];
        if (b && b.behavior !== 'trans') {
          live.push(b);
          break;
        }
      }
    }
    // ZMK runs a combo when the highest active layer is one of its layers.
    for (const combo of this.combos) {
      if (combo.layers === 'all' || (top[0] !== undefined && combo.layers.includes(top[0]))) live.push(combo.binding);
    }
    return live;
  }

  /** `&to` another layer or `&tog target`, possibly after holding or toggling other layers. */
  exists(target: number, start: number[]): boolean {
    const memoKey = `${target}|${[...start].sort((a, b) => a - b).join(',')}`;
    const known = this.memo.get(memoKey);
    if (known !== undefined) return known;
    const result = this.search(target, start);
    this.memo.set(memoKey, result);
    return result;
  }

  private search(target: number, start: number[]): boolean {
    const count = this.model.layers.length;
    const keyOf = (on: Set<number>) => [...on].sort((a, b) => a - b).join(',');
    const first = this.settle(new Set(start));
    const queue = [first];
    const seen = new Set([keyOf(first)]);
    const visit = (next: Set<number>) => {
      const settled = this.settle(next);
      const key = keyOf(settled);
      if (seen.has(key) || !settled.has(target)) return;
      seen.add(key);
      queue.push(settled);
    };
    for (const on of queue) {
      if (seen.size > SEARCH_LIMIT) return true;
      for (const found of new Set(this.live(on).flatMap((b) => this.finder.find(b)))) {
        if (found.to >= count) continue;
        if (found.kind === 'to' && found.to !== target) return true;
        if (found.kind === 'toggle' && found.to === target && found.mode !== 'on') return true;
        if ((found.kind === 'momentary' || found.kind === 'sticky') && !on.has(found.to)) visit(new Set([...on, found.to]));
        if (found.kind === 'toggle' && found.to !== target) {
          if (!on.has(found.to) && found.mode !== 'off') visit(new Set([...on, found.to]));
          if (on.has(found.to) && found.mode !== 'on') visit(new Set([...on].filter((l) => l !== found.to)));
        }
      }
    }
    return false;
  }
}

/** Everything that turns each layer on, and the keymap's layer mistakes. */
export function layerUsage(model: KeymapModel): { references: LayerReference[]; warnings: LayerWarning[] } {
  const finder = new Finder(model);
  const refs = collect(model, finder);
  const count = model.layers.length;
  const warnings: LayerWarning[] = [];

  for (const ref of refs) {
    if (ref.to >= count) warnings.push({ kind: 'missing-layer', token: ref.token, from: ref.from });
  }
  for (const combo of model.combos) {
    const layers = comboLayers(finder, combo.layers);
    if (layers === 'all') continue;
    combo.layers?.forEach((token, i) => {
      if ((layers[i] ?? 0) >= count)
        warnings.push({ kind: 'missing-layer', token, from: { kind: 'combo', name: combo.name, layers } });
    });
  }
  const conditionals = refs.filter((r) => r.from.kind === 'conditional');
  for (const c of conditionals) {
    if (c.from.kind !== 'conditional') continue;
    for (const index of c.from.ifLayers) {
      if (index >= count) warnings.push({ kind: 'missing-layer', token: String(index), from: c.from });
    }
  }

  // Layer names we can't resolve could point anywhere, so reachability can't be judged.
  if (finder.unresolved.size > 0) {
    warnings.push({ kind: 'unresolved', tokens: [...finder.unresolved] });
  } else {
    const reached = reachableLayers(model, refs);
    for (let l = 1; l < count; l++) if (!reached.has(l)) warnings.push({ kind: 'unreachable', layer: l });

    // A layer stays on after a toggle or `&to`; one only held or turned on with others is off once let go.
    // (Counting toggles from unreachable layers too only ever means fewer warnings.)
    const stays = new Set([
      0,
      ...refs.filter((r) => (r.kind === 'toggle' && r.mode !== 'off') || r.kind === 'to').map((r) => r.to),
    ]);
    const thenLayers = new Set(conditionals.map((c) => c.to));
    const wayBack = new WayBack(model, finder, conditionals);
    const stuck = new Map<number, LayerReference[]>();
    for (const ref of refs) {
      if ((ref.kind !== 'to' && ref.kind !== 'toggle') || ref.mode === 'off' || ref.to === 0 || ref.to >= count) continue;
      // ZMK turns a conditional layer straight back off unless its if-layers are on.
      if (thenLayers.has(ref.to) || !sourceLive(ref.from, (l) => reached.has(l))) continue;
      const source = ref.kind === 'toggle' && 'layer' in ref.from && stays.has(ref.from.layer) ? [ref.from.layer] : [];
      if (!wayBack.exists(ref.to, [0, ...source, ref.to])) stuck.set(ref.to, [...(stuck.get(ref.to) ?? []), ref]);
    }
    for (const [layer, entries] of [...stuck].sort(([a], [b]) => a - b)) warnings.push({ kind: 'no-way-back', layer, entries });
  }

  const keys = model.layers[0]?.bindings.flatMap((b, i) => (b.behavior === 'trans' ? [i] : [])) ?? [];
  if (keys.length > 0) warnings.push({ kind: 'base-trans', keys });
  return { references: refs, warnings };
}

export const layerReferences = (model: KeymapModel): LayerReference[] => layerUsage(model).references;

export const layerWarnings = (model: KeymapModel): LayerWarning[] => layerUsage(model).warnings;
