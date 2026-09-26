import type { DtNode, TopLevelItem } from '../dts/ast.ts';
import { behaviorCatalog, findBehavior, findBuiltinBehavior, type BehaviorDef, type ParamType } from '../catalog/behaviors.ts';
import { numericDefines, resolveLayerIndex } from './layers.ts';
import type { Binding, Combo, KeymapModel, Layer } from './model.ts';

/** Sets one key's binding and adds the include its behavior needs. */
export function setBinding(model: KeymapModel, layerIndex: number, keyIndex: number, binding: Binding): KeymapModel {
  const layer = model.layers[layerIndex];
  if (!layer || keyIndex < 0 || keyIndex >= layer.bindings.length) throw new Error('No such key');
  const bindings = layer.bindings.with(keyIndex, binding);
  const layers = model.layers.with(layerIndex, { ...layer, bindings });
  return ensureInclude({ ...model, layers }, findBuiltinBehavior(binding.behavior)?.include);
}

/** Adds `#include <path>` after the last include, unless it is already there. */
export function ensureInclude(model: KeymapModel, path: string | undefined): KeymapModel {
  if (!path || model.topLevel.some((i) => i.kind === 'include' && i.path === path)) return model;
  const item: TopLevelItem = { kind: 'include', path, system: true };
  const lastInclude = model.topLevel.findLastIndex((i) => i.kind === 'include');
  const topLevel = [...model.topLevel];
  topLevel.splice(lastInclude + 1, 0, item);
  return { ...model, topLevel };
}

function defaultParam(type: ParamType, model: KeymapModel): string[] {
  switch (type.kind) {
    case 'keycode':
      return [type.default ?? 'A'];
    case 'layer':
      return [String(Math.min(1, Math.max(0, model.layers.length - 1)))];
    case 'enum': {
      const option = type.options.find((o) => o.value === type.default) ?? type.options[0];
      if (!option) return [];
      return option.number ? [option.value, String(option.number.default)] : [option.value];
    }
    case 'number':
      return [String(type.default ?? 0)];
    case 'raw':
      return ['0'];
  }
}

/**
 * Switches a binding to another behavior, carrying over keycode and layer
 * params where they fit (the tap key first) and filling in defaults.
 */
export function changeBehavior(binding: Binding, ref: string, model: KeymapModel): Binding {
  const catalog = behaviorCatalog(model);
  const oldDef = findBehavior(catalog, binding.behavior);
  const newDef = findBehavior(catalog, ref);
  if (!newDef) return { behavior: ref, params: [] };

  const carried: Record<'keycode' | 'layer', string[]> = { keycode: [], layer: [] };
  const order = oldDef ? paramOrder(oldDef) : [];
  for (const index of order) {
    const type = oldDef?.params[index];
    const token = binding.params[index];
    if (token !== undefined && (type?.kind === 'keycode' || type?.kind === 'layer')) carried[type.kind].push(token);
  }

  const params: string[] = [];
  newDef.params.forEach((type) => {
    if (type.kind === 'keycode' && type.default) params.push(type.default);
    else if ((type.kind === 'keycode' || type.kind === 'layer') && carried[type.kind].length > 0) {
      params.push(carried[type.kind].shift() ?? '');
    } else params.push(...defaultParam(type, model));
  });
  return { behavior: ref, params };
}

/** Param indices with the tap param before the hold param. */
function paramOrder(def: BehaviorDef): number[] {
  const indices = def.params.map((_, i) => i);
  return def.holdParam === undefined ? indices : [...indices.filter((i) => i !== def.holdParam), def.holdParam];
}

function nodeName(displayName: string, taken: Set<string>): string {
  const base = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'layer';
  const start = /^[a-z]/.test(base) ? base : `layer_${base}`;
  let name = start;
  for (let n = 2; taken.has(name); n++) name = `${start}_${n}`;
  return name;
}

export function addLayer(model: KeymapModel, displayName: string): KeymapModel {
  const keyCount = model.layers[0]?.bindings.length ?? 0;
  const layer: Layer = {
    name: nodeName(displayName, new Set(model.layers.map((l) => l.name))),
    displayName,
    bindings: Array.from({ length: keyCount }, () => ({ behavior: 'trans', params: [] })),
    properties: [],
  };
  const sensorCount = model.layers[0]?.sensorBindings?.length ?? 0;
  if (sensorCount > 0) layer.sensorBindings = Array.from({ length: sensorCount }, () => ({ behavior: 'trans', params: [] }));
  return { ...model, layers: [...model.layers, layer] };
}

export function renameLayer(model: KeymapModel, index: number, displayName: string): KeymapModel {
  const layer = model.layers[index];
  if (!layer) throw new Error('No such layer');
  const taken = new Set(model.layers.filter((_, i) => i !== index).map((l) => l.name));
  const layers = model.layers.with(index, { ...layer, displayName, name: nodeName(displayName, taken) });
  return { ...model, layers };
}

export function moveLayer(model: KeymapModel, from: number, to: number): KeymapModel {
  const order = model.layers.map((_, i) => i);
  const [moved] = order.splice(from, 1);
  if (moved === undefined || to < 0 || to >= model.layers.length) throw new Error('No such layer');
  order.splice(to, 0, moved);
  const newIndex = new Map(order.map((old, index) => [old, index]));
  const remapped = remapLayers(model, (old) => newIndex.get(old) ?? old);
  return { ...remapped.model, layers: order.map((old) => remapped.model.layers[old]).filter((l): l is Layer => !!l) };
}

export interface DeleteLayerResult {
  model: KeymapModel;
  /** Combos removed because they only worked on the deleted layer. */
  removedCombos: string[];
}

export function deleteLayer(model: KeymapModel, index: number): DeleteLayerResult {
  if (model.layers.length <= 1) throw new Error("Can't delete the last layer");
  if (!model.layers[index]) throw new Error('No such layer');
  const { model: remapped, removedCombos } = remapLayers(model, (old) =>
    old === index ? null : old > index ? old - 1 : old,
  );
  return { model: { ...remapped, layers: remapped.layers.filter((_, i) => i !== index) }, removedCombos };
}

type LayerMap = (oldIndex: number) => number | null;

/**
 * Renumbers every layer reference. References to a removed layer (`null`)
 * become `&none`, or `&kp <tap>` for a layer-tap; combos left without layers
 * are removed.
 */
function remapLayers(model: KeymapModel, map: LayerMap): DeleteLayerResult {
  const catalog = behaviorCatalog(model);
  const defines = numericDefines(model);
  const usedDefines = new Set<string>();

  /** The new token, or null when it points at a removed layer. Unknown tokens stay. */
  const remapToken = (token: string): string | null => {
    const index = resolveLayerIndex(token, defines);
    if (index === undefined) return token;
    const next = map(index);
    if (next === null) return null;
    if (defines.has(token)) {
      usedDefines.add(token);
      return token;
    }
    return String(next);
  };

  const remapBinding = (binding: Binding): Binding => {
    const def = findBehavior(catalog, binding.behavior);
    if (!def) return binding;
    const params = [...binding.params];
    for (const [i, type] of def.params.entries()) {
      const token = params[i];
      if (type.kind !== 'layer' || token === undefined) continue;
      const next = remapToken(token);
      if (next !== null) {
        params[i] = next;
        continue;
      }
      const tap = def.holdParam === i ? params[i === 0 ? 1 : 0] : undefined;
      const tapType = def.holdParam === i ? def.params[i === 0 ? 1 : 0] : undefined;
      return tap !== undefined && tapType?.kind === 'keycode'
        ? { behavior: 'kp', params: [tap] }
        : { behavior: 'none', params: [] };
    }
    return { behavior: binding.behavior, params };
  };

  const layers = model.layers.map((layer): Layer => {
    const next: Layer = { ...layer, bindings: layer.bindings.map(remapBinding) };
    if (layer.sensorBindings) next.sensorBindings = layer.sensorBindings.map(remapBinding);
    return next;
  });
  const behaviors = model.behaviors.map((b) => ({ ...b, bindings: b.bindings.map(remapBinding) }));

  const removedCombos: string[] = [];
  const combos: Combo[] = [];
  for (const combo of model.combos) {
    const next: Combo = { ...combo, binding: remapBinding(combo.binding) };
    if (combo.layers) {
      const layerTokens = combo.layers.map(remapToken).filter((t): t is string => t !== null);
      if (combo.layers.length > 0 && layerTokens.length === 0) {
        removedCombos.push(combo.name);
        continue;
      }
      next.layers = layerTokens;
    }
    combos.push(next);
  }

  const extraNodes = model.extraNodes.map((node) =>
    node.name === 'conditional_layers' ? remapConditionalLayers(node, remapToken) : node,
  );

  const topLevel = model.topLevel.map((item): TopLevelItem => {
    if (item.kind !== 'define' || !usedDefines.has(item.name)) return item;
    const next = map(Number(item.value));
    return next === null ? item : { ...item, value: String(next) };
  });

  return { model: { ...model, topLevel, layers, behaviors, combos, extraNodes }, removedCombos };
}

function remapConditionalLayers(node: DtNode, remapToken: (token: string) => string | null): DtNode {
  const children: DtNode[] = [];
  for (const child of node.children) {
    let removed = false;
    const properties = child.properties.map((property) => {
      if (property.name !== 'if-layers' && property.name !== 'then-layer') return property;
      const values = property.values.map((value) => {
        if (value.kind !== 'cells') return value;
        const tokens = value.tokens.map(remapToken);
        if (tokens.some((t) => t === null)) removed = true;
        return { kind: 'cells' as const, tokens: tokens.filter((t): t is string => t !== null) };
      });
      return { ...property, values };
    });
    if (!removed) children.push({ ...child, properties });
  }
  return { ...node, children };
}
