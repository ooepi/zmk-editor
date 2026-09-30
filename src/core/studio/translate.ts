import { behaviorCatalog, findBehavior, type BehaviorDef } from '../catalog/behaviors.ts';
import { numericDefines, resolveLayerIndex } from '../keymap/layers.ts';
import type { Binding, KeymapModel } from '../keymap/model.ts';
import type { BehaviorMap, CellKind, DeviceBehavior } from './behaviors.ts';
import { decodeEnum, enumCellCount, enumCells } from './enums.ts';
import { decodeKey, encodeKey } from './usage.ts';

/** A binding as ZMK Studio sends it. */
export interface DeviceBinding {
  behaviorId: number;
  param1: number;
  param2: number;
}

export interface TranslateContext {
  keymap: KeymapModel;
  /** The keyboard's behaviors by id. */
  device: Map<number, DeviceBehavior>;
  behaviors: BehaviorMap;
  /** The keyboard's id for the editor's layer at `index`, if the keyboard has it. */
  layerId: (index: number) => number | undefined;
  /** The editor's layer index for a keyboard layer id. */
  layerIndex: (id: number) => number | undefined;
}

/**
 * Why a binding can't go to the keyboard: its behavior isn't in the firmware, it points at a layer
 * the keyboard doesn't have yet, or a param can't be put into numbers.
 */
export type SendProblem = 'not-on-keyboard' | 'pending-layer' | 'untranslatable';
export type ReadProblem = 'unknown-behavior' | 'untranslatable';

const catalogs = new WeakMap<KeymapModel, { catalog: BehaviorDef[]; defines: Map<string, number> }>();
function lookup(keymap: KeymapModel) {
  let entry = catalogs.get(keymap);
  if (!entry) {
    entry = { catalog: behaviorCatalog(keymap), defines: numericDefines(keymap) };
    catalogs.set(keymap, entry);
  }
  return entry;
}

function parseNumber(token: string, defines: Map<string, number>): number | undefined {
  if (/^\d+$/.test(token)) return Number(token);
  if (/^0x[0-9a-f]+$/i.test(token)) return Number.parseInt(token, 16);
  return defines.get(token);
}

export function toDevice(binding: Binding, ctx: TranslateContext): { ok: DeviceBinding } | { reason: SendProblem } {
  const id = ctx.behaviors.idByRef.get(binding.behavior);
  const behavior = id === undefined ? undefined : ctx.device.get(id);
  if (id === undefined || !behavior) return { reason: 'not-on-keyboard' };
  const { defines } = lookup(ctx.keymap);
  const cells: number[] = [];
  for (const token of binding.params) {
    const fromEnum = enumCells(binding.behavior, token);
    if (fromEnum) {
      cells.push(...fromEnum);
      continue;
    }
    const kind: CellKind = behavior.cells[cells.length] ?? 'none';
    if (kind === 'keycode') {
      const value = encodeKey(token);
      if (value === undefined) return { reason: 'untranslatable' };
      cells.push(value);
    } else if (kind === 'layer') {
      const index = resolveLayerIndex(token, defines);
      if (index === undefined || index >= ctx.keymap.layers.length) return { reason: 'untranslatable' };
      const layer = ctx.layerId(index);
      if (layer === undefined) return { reason: 'pending-layer' };
      cells.push(layer);
    } else {
      const value = parseNumber(token, defines);
      if (value === undefined) return { reason: 'untranslatable' };
      cells.push(value);
    }
  }
  if (cells.length > 2) return { reason: 'untranslatable' };
  return { ok: { behaviorId: id, param1: cells[0] ?? 0, param2: cells[1] ?? 0 } };
}

export function fromDevice(binding: DeviceBinding, ctx: TranslateContext): { ok: Binding } | { reason: ReadProblem } {
  const ref = ctx.behaviors.refById.get(binding.behaviorId);
  const behavior = ctx.device.get(binding.behaviorId);
  if (ref === undefined || !behavior) return { reason: 'unknown-behavior' };
  const values = [binding.param1, binding.param2];
  if (enumCellCount(ref) !== undefined) {
    const params = decodeEnum(ref, values);
    return params ? { ok: { behavior: ref, params } } : { reason: 'untranslatable' };
  }
  const def = findBehavior(lookup(ctx.keymap).catalog, ref);
  const count = def ? def.params.length : behavior.cells.filter((k) => k !== 'none').length;
  const params: string[] = [];
  for (let i = 0; i < count; i++) {
    const value = values[i] ?? 0;
    const kind = behavior.cells[i] ?? 'none';
    const token = kind === 'keycode' ? decodeKey(value) : kind === 'layer' ? ctx.layerIndex(value)?.toString() : String(value);
    if (token === undefined) return { reason: 'untranslatable' };
    params.push(token);
  }
  return { ok: { behavior: ref, params } };
}
