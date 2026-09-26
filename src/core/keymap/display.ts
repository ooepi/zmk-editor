import { behaviorCatalog, findBehavior, type BehaviorDef, type ParamType } from '../catalog/behaviors.ts';
import { keyExpressionLabel } from '../catalog/keycodes.ts';
import { unicodeLabel } from '../catalog/unicode.ts';
import { layerDisplayName, numericDefines } from './layers.ts';
import { behaviorKind, type Binding, type KeymapModel } from './model.ts';

export type KeycapKind = 'key' | 'hold-tap' | 'layer' | 'trans' | 'none' | 'mod-morph' | 'macro' | 'other';

/** What a keycap shows: `main` large, `sub` small (hold action or kind of key). */
export interface KeycapLabel {
  main: string;
  sub?: string;
  kind: KeycapKind;
}

export interface DisplayContext {
  model: KeymapModel;
  catalog: BehaviorDef[];
  defines: Map<string, number>;
}

export function displayContext(model: KeymapModel): DisplayContext {
  return { model, catalog: behaviorCatalog(model), defines: numericDefines(model) };
}

const LAYER_REFS = new Set(['mo', 'tog', 'to', 'sl']);

export function describeParam(token: string | undefined, type: ParamType | undefined, ctx: DisplayContext): string {
  if (token === undefined) return '';
  switch (type?.kind) {
    case 'keycode':
      return keyExpressionLabel(token);
    case 'layer':
      return layerDisplayName(ctx.model, token, ctx.defines);
    case 'enum':
      return type.options.find((o) => o.value === token)?.label ?? token;
    default:
      return token;
  }
}

/** Keycap labels for a binding. Accepts a model or a prepared context (faster for many keys). */
export function describeBinding(binding: Binding, modelOrContext: KeymapModel | DisplayContext): KeycapLabel {
  const ctx = 'catalog' in modelOrContext ? modelOrContext : displayContext(modelOrContext);
  const { behavior: ref, params } = binding;
  const def = findBehavior(ctx.catalog, ref);
  if (!def) {
    return params.length > 0 ? { main: params.join(' '), sub: ref, kind: 'other' } : { main: ref, kind: 'other' };
  }
  if (ref === 'trans') return { main: '▽', kind: 'trans' };
  if (ref === 'none') return { main: '✕', kind: 'none' };
  if (LAYER_REFS.has(ref) || ref === 'num_word') {
    return { main: describeParam(params[0], def.params[0], ctx), sub: ref, kind: 'layer' };
  }
  if (def.params[0]?.kind === 'unicode') return { ...unicodeLabel(params), kind: 'key' };

  if (def.holdParam !== undefined) {
    const tapIndex = def.holdParam === 0 ? 1 : 0;
    return {
      main: describeParam(params[tapIndex], def.params[tapIndex], ctx),
      sub: describeParam(params[def.holdParam], def.params[def.holdParam], ctx),
      kind: 'hold-tap',
    };
  }

  const custom = def.behavior;
  if (custom) {
    const kind = behaviorKind(custom);
    if (kind === 'mod-morph') {
      const [normal, morphed] = custom.bindings.map((b) => describeBinding(b, ctx).main);
      const label: KeycapLabel = { main: normal ?? def.name, kind: 'mod-morph' };
      if (morphed) label.sub = morphed;
      return label;
    }
    if (kind === 'tap-dance' && custom.bindings[0]) {
      return { main: describeBinding(custom.bindings[0], ctx).main, sub: `×${custom.bindings.length} ${ref}`, kind: 'mod-morph' };
    }
    return { main: def.name, sub: kind === 'other' ? ref : kind, kind: kind === 'macro' ? 'macro' : 'other' };
  }

  const firstType = def.params[0];
  if (firstType?.kind === 'enum') {
    const option = firstType.options.find((o) => o.value === params[0]);
    let main = option?.label ?? params.join(' ');
    if (option?.number && params[1] !== undefined) {
      const n = Number(params[1]);
      main = `${main} ${Number.isInteger(n) ? n + (option.number.offset ?? 0) : params[1]}`;
    }
    return withTag({ main, kind: 'other' }, def);
  }
  if (def.params.length === 0) return withTag({ main: def.keycap ?? def.name, kind: 'other' }, def);
  return withTag({ main: describeParam(params[0], firstType, ctx), kind: 'key' }, def);
}

function withTag(label: KeycapLabel, def: BehaviorDef): KeycapLabel {
  return def.tag ? { ...label, sub: def.tag } : label;
}

/** What an encoder does each way. `name` is set for the keymap's own sensor behaviors. */
export interface SensorLabel {
  cw: string;
  ccw: string;
  name?: string;
}

export function describeSensorBinding(binding: Binding, modelOrContext: KeymapModel | DisplayContext): SensorLabel {
  const ctx = 'catalog' in modelOrContext ? modelOrContext : displayContext(modelOrContext);
  const { behavior: ref, params } = binding;
  if (ref === 'trans') return { cw: '▽', ccw: '▽' };
  if (ref === 'none') return { cw: '✕', ccw: '✕' };
  const def = findBehavior(ctx.catalog, ref);
  if (ref === 'inc_dec_kp') {
    return { cw: describeParam(params[0], def?.params[0], ctx), ccw: describeParam(params[1], def?.params[1], ctx) };
  }
  const custom = def?.behavior;
  if (custom && behaviorKind(custom) === 'sensor-rotate') {
    // sensor-rotate-var passes one param to each direction's binding.
    const [cw, ccw] = [0, 1].map((i) => {
      const inner = custom.bindings[i];
      if (!inner) return '?';
      const param = params[i];
      return describeBinding(param !== undefined && inner.params.length === 0 ? { ...inner, params: [param] } : inner, ctx).main;
    });
    return { cw: cw ?? '?', ccw: ccw ?? '?', name: ref };
  }
  const text = [ref, ...params].join(' ');
  return { cw: text, ccw: text };
}
