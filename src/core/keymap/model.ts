import type { DtNode, DtProperty, TopLevelItem } from '../dts/ast.ts';

/**
 * One binding such as `&kp LG(PG_UP)`. Params stay as source tokens so
 * `#define` names and modifier functions survive a round trip.
 */
export interface Binding {
  behavior: string;
  params: string[];
}

/**
 * Every behavior shares one shape; its kind comes from `compatible`, so
 * behaviors the editor doesn't know still round-trip.
 */
export interface Behavior {
  /** Node name, e.g. `Mouse_Scroller`. */
  name: string;
  /** The label bindings reference, e.g. `scroll_up_down` for `&scroll_up_down`. */
  label?: string;
  compatible: string;
  bindings: Binding[];
  /** Other properties in source order (`#binding-cells`, `tapping-term-ms`, …). */
  properties: DtProperty[];
  /** Child nodes, such as leader-key sequences or adaptive-key triggers. */
  children?: DtNode[];
}

export interface Combo {
  name: string;
  /** Tokens, so `#define`d key positions are kept. */
  keyPositions: string[];
  binding: Binding;
  layers?: string[];
  properties: DtProperty[];
}

export interface Layer {
  name: string;
  label?: string;
  displayName?: string;
  bindings: Binding[];
  sensorBindings?: Binding[];
  properties: DtProperty[];
}

export interface KeymapModel {
  /** Includes, defines, other directives, `&node { … }` overrides and raw text, in source order. */
  topLevel: TopLevelItem[];
  behaviors: Behavior[];
  combos: Combo[];
  layers: Layer[];
  /** Spare layers (`status = "reserved"`) that ZMK Studio can switch on; always after `layers`. */
  reservedLayers?: DtNode[];
  /** Properties set directly on the root node. */
  rootProperties: DtProperty[];
  /** Root children the model doesn't cover, kept as generic nodes. */
  extraNodes: DtNode[];
}

export type BehaviorKind = 'hold-tap' | 'mod-morph' | 'macro' | 'sensor-rotate' | 'tap-dance' | 'other';

export function behaviorKind(behavior: Pick<Behavior, 'compatible'>): BehaviorKind {
  switch (behavior.compatible) {
    case 'zmk,behavior-hold-tap':
      return 'hold-tap';
    case 'zmk,behavior-mod-morph':
      return 'mod-morph';
    case 'zmk,behavior-macro':
    case 'zmk,behavior-macro-one-param':
    case 'zmk,behavior-macro-two-param':
      return 'macro';
    case 'zmk,behavior-sensor-rotate':
    case 'zmk,behavior-sensor-rotate-var':
      return 'sensor-rotate';
    case 'zmk,behavior-tap-dance':
      return 'tap-dance';
    default:
      return 'other';
  }
}

export function emptyKeymap(): KeymapModel {
  return { topLevel: [], behaviors: [], combos: [], layers: [], rootProperties: [], extraNodes: [] };
}
