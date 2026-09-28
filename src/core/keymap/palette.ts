import { behaviorCatalog, findBehavior, offeredIn, type BehaviorDef, type BehaviorGroup } from '../catalog/behaviors.ts';
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
