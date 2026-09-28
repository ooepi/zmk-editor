import { BEHAVIOR_GROUPS, behaviorCatalog, findBehavior, offeredIn, type BehaviorDef, type BehaviorGroup } from '../catalog/behaviors.ts';
import { formatBinding } from './bindings.ts';
import { describeBinding, displayContext, type KeycapLabel } from './display.ts';
import { changeBehavior, paramOrder } from './edit.ts';
import type { Binding, KeymapModel } from './model.ts';

/** Something that can be dropped on a key: a keycode (`B`, `LC(C)`) or a whole binding. */
export type PaletteItem = { kind: 'keycode'; token: string } | { kind: 'binding'; binding: Binding };

/**
 * What a key's binding becomes when `item` is dropped on it. A keycode keeps the
 * key's behavior and replaces its tap key (`&mt LSHIFT A` + B → `&mt LSHIFT B`);
 * keys without a keycode become `&kp`. A binding replaces the whole key.
 */
export function applyPaletteItem(current: Binding, item: PaletteItem, model: KeymapModel): Binding {
  if (item.kind === 'binding') return item.binding;
  const def = findBehavior(behaviorCatalog(model), current.behavior);
  // Enum and unicode params can take more than one token; only match simple bindings.
  const index =
    def && def.params.length === current.params.length
      ? paramOrder(def).find((i) => def.params[i]?.kind === 'keycode')
      : undefined;
  if (index === undefined) return { behavior: 'kp', params: [item.token] };
  return { behavior: current.behavior, params: current.params.with(index, item.token) };
}

export interface BehaviorTile {
  group: BehaviorGroup;
  label: KeycapLabel;
  binding: Binding;
  /** Tooltip: the behavior's name and what it does. */
  title: string;
}

/** ZMK's default number of Bluetooth profiles. */
const PROFILE_TILES = 5;

function bindingsFor(def: BehaviorDef, model: KeymapModel): Binding[] {
  const base = changeBehavior({ behavior: 'none', params: [] }, def.ref, model);
  const [first] = def.params;
  const layerIndex = def.params.findIndex((p) => p.kind === 'layer');
  if (layerIndex >= 0 && def.params.length === base.params.length) {
    return model.layers.map((_, i) => ({ ...base, params: base.params.with(layerIndex, String(i)) }));
  }
  if (def.params.length === 1 && first?.kind === 'enum') {
    return first.options.flatMap((option) =>
      option.number
        ? Array.from({ length: PROFILE_TILES }, (_, n) => ({ behavior: def.ref, params: [option.value, String(n)] }))
        : [{ behavior: def.ref, params: [option.value] }],
    );
  }
  return [base];
}

/**
 * Ready-made tiles for every behavior a key can use, apart from plain key presses:
 * one per layer for layer behaviors, one per option for enum behaviors.
 */
export function behaviorTiles(model: KeymapModel): BehaviorTile[] {
  const ctx = displayContext(model);
  return ctx.catalog
    .filter((def) => def.ref !== 'kp' && offeredIn('key', def))
    .flatMap((def) =>
      bindingsFor(def, model).map((binding) => ({
        group: def.group,
        label: describeBinding(binding, ctx),
        binding,
        title: `${def.name}: ${def.description}`,
      })),
    );
}

/** How many recently placed items the palette remembers. */
export const RECENT_LIMIT = 16;

/** The recent list with `item` first, without duplicates, at most `limit` long. */
export function pushRecent(list: PaletteItem[], item: PaletteItem, limit = RECENT_LIMIT): PaletteItem[] {
  const key = JSON.stringify(item);
  return [item, ...list.filter((i) => JSON.stringify(i) !== key)].slice(0, limit);
}

const GROUP_LABELS = new Map(BEHAVIOR_GROUPS.map((g) => [g.id, g.label]));

/** Tiles whose label, behavior, description or group contain every word of the query. */
export function searchTiles(tiles: BehaviorTile[], query: string): BehaviorTile[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return tiles;
  return tiles.filter((tile) => {
    const text = [tile.label.main, tile.label.sub ?? '', tile.title, formatBinding(tile.binding), GROUP_LABELS.get(tile.group) ?? '']
      .join(' ')
      .toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** Which way an encoder turns; `&inc_dec_kp` takes the clockwise key first. */
export type EncoderDirection = 'cw' | 'ccw';

const ENCODER_DEFAULTS = ['C_VOL_UP', 'C_VOL_DN'];

/**
 * What an encoder's binding becomes when `item` is dropped on one of its
 * directions: a keycode sets that direction of an `&inc_dec_kp` (other
 * encoders become one); transparent and none replace the binding. Null when
 * the item can't go on an encoder.
 */
export function applyToEncoder(current: Binding, item: PaletteItem, direction: EncoderDirection): Binding | null {
  if (item.kind === 'binding') {
    return item.binding.behavior === 'trans' || item.binding.behavior === 'none' ? item.binding : null;
  }
  const params = current.behavior === 'inc_dec_kp' && current.params.length === 2 ? current.params : ENCODER_DEFAULTS;
  return { behavior: 'inc_dec_kp', params: params.with(direction === 'cw' ? 0 : 1, item.token) };
}
