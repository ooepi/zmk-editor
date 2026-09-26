import type { DtNode } from '../dts/ast.ts';
import type { KeymapModel } from './model.ts';

/** "When all of `ifLayers` are on, turn on `thenLayer`" (e.g. Lower + Raise = Adjust). */
export interface ConditionalLayer {
  name: string;
  ifLayers: string[];
  thenLayer: string;
}

const NODE = 'conditional_layers';

function cells(node: DtNode, name: string): string[] {
  const value = node.properties.find((p) => p.name === name)?.values[0];
  return value?.kind === 'cells' ? value.tokens : [];
}

/** Conditional layers live in the generic extra nodes, so they round-trip and are renumbered with layers. */
export function getConditionalLayers(model: KeymapModel): ConditionalLayer[] {
  const node = model.extraNodes.find((n) => n.name === NODE);
  return (node?.children ?? []).map((child) => ({
    name: child.name,
    ifLayers: cells(child, 'if-layers'),
    thenLayer: cells(child, 'then-layer')[0] ?? '',
  }));
}

export function setConditionalLayers(model: KeymapModel, list: ConditionalLayer[]): KeymapModel {
  const others = model.extraNodes.filter((n) => n.name !== NODE);
  if (list.length === 0) return { ...model, extraNodes: others };
  const existing = model.extraNodes.find((n) => n.name === NODE);
  const node: DtNode = {
    name: NODE,
    labels: existing?.labels ?? [],
    properties: existing?.properties ?? [{ name: 'compatible', values: [{ kind: 'string', value: 'zmk,conditional-layers' }] }],
    children: list.map((c) => ({
      name: c.name,
      labels: [],
      properties: [
        { name: 'if-layers', values: [{ kind: 'cells', tokens: c.ifLayers }] },
        { name: 'then-layer', values: [{ kind: 'cells', tokens: [c.thenLayer] }] },
      ],
      children: [],
    })),
  };
  const index = model.extraNodes.findIndex((n) => n.name === NODE);
  const extraNodes = index === -1 ? [...others, node] : model.extraNodes.map((n) => (n.name === NODE ? node : n));
  return { ...model, extraNodes };
}
