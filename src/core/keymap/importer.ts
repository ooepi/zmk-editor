import type { DtNode, DtProperty } from '../dts/ast.ts';
import { parseDts } from '../dts/parser.ts';
import { bindingsFromValues } from './bindings.ts';
import type { Behavior, Combo, KeymapModel, Layer } from './model.ts';
import { emptyKeymap } from './model.ts';

export interface ImportResult<T> {
  model: T;
  /** Things kept as raw text or generic nodes, for the user to review. */
  warnings: string[];
}

/** Best-effort `.keymap` import. Whatever can't be modeled is kept, never dropped. */
export function importKeymap(text: string): ImportResult<KeymapModel> {
  const doc = parseDts(text);
  const model = emptyKeymap();
  const warnings: string[] = [];

  model.topLevel = doc.items;
  for (const item of doc.items) {
    if (item.kind === 'raw') warnings.push(`Kept as raw text: ${firstLine(item.text)}`);
  }

  if (doc.root) {
    model.rootProperties = doc.root.properties;
    for (const child of doc.root.children) {
      switch (child.name) {
        case 'behaviors':
        case 'macros':
          importContainer(child, model.behaviors, toBehavior, model, warnings);
          break;
        case 'combos':
          importContainer(child, model.combos, toCombo, model, warnings, 'zmk,combos');
          break;
        case 'keymap':
          importContainer(child, model.layers, toLayer, model, warnings, 'zmk,keymap');
          break;
        default:
          model.extraNodes.push(child);
      }
    }
  }
  return { model, warnings };
}

/**
 * Reads the children of a container node (`behaviors`, `combos`, …). Children
 * or properties that don't fit are kept in an extra node of the same name,
 * which devicetree merges back with the generated container.
 */
function importContainer<T>(
  container: DtNode,
  into: T[],
  convert: (node: DtNode) => T | null,
  model: KeymapModel,
  warnings: string[],
  compatible?: string,
): void {
  const leftover: DtNode = { name: container.name, labels: container.labels, properties: [], children: [] };
  for (const property of container.properties) {
    if (compatible && property.name === 'compatible' && stringValue(property) === compatible) continue;
    leftover.properties.push(property);
  }
  for (const child of container.children) {
    const converted = convert(child);
    if (converted) into.push(converted);
    else {
      leftover.children.push(child);
      warnings.push(`Kept ${container.name}/${child.name} as a generic node`);
    }
  }
  if (leftover.properties.length > 0 || leftover.children.length > 0 || leftover.labels.length > 0) {
    model.extraNodes.push(leftover);
  }
}

function toBehavior(node: DtNode): Behavior | null {
  const [label, ...extraLabels] = node.labels;
  if (extraLabels.length > 0) return null;
  const compatible = node.properties.find((p) => p.name === 'compatible');
  const compatibleValue = compatible && stringValue(compatible);
  if (!compatibleValue || node.children.length > 0) return null;

  const behavior: Behavior = { name: node.name, compatible: compatibleValue, bindings: [], properties: [] };
  if (label) behavior.label = label;
  for (const property of node.properties) {
    if (property === compatible) continue;
    const bindings = property.name === 'bindings' ? bindingsFromValues(property.values) : null;
    if (bindings && bindings.length > 0) behavior.bindings = bindings;
    else behavior.properties.push(property);
  }
  return behavior;
}

function toCombo(node: DtNode): Combo | null {
  if (node.labels.length > 0 || node.children.length > 0) return null;
  let keyPositions: string[] | undefined;
  let binding: Combo['binding'] | undefined;
  let layers: string[] | undefined;
  const properties: DtProperty[] = [];
  for (const property of node.properties) {
    const cells = cellTokens(property);
    if (property.name === 'key-positions' && cells) keyPositions = cells;
    else if (property.name === 'layers' && cells) layers = cells;
    else if (property.name === 'bindings') {
      const bindings = bindingsFromValues(property.values);
      if (bindings?.length !== 1 || !bindings[0]) return null;
      binding = bindings[0];
    } else properties.push(property);
  }
  if (!keyPositions || !binding) return null;
  const combo: Combo = { name: node.name, keyPositions, binding, properties };
  if (layers) combo.layers = layers;
  return combo;
}

function toLayer(node: DtNode): Layer | null {
  const [label, ...extraLabels] = node.labels;
  if (extraLabels.length > 0 || node.children.length > 0) return null;
  const layer: Layer = { name: node.name, bindings: [], properties: [] };
  if (label) layer.label = label;
  let hasBindings = false;
  for (const property of node.properties) {
    const display = property.name === 'display-name' ? stringValue(property) : undefined;
    const bindings =
      property.name === 'bindings' || property.name === 'sensor-bindings' ? bindingsFromValues(property.values) : null;
    if (display !== undefined) layer.displayName = display;
    else if (property.name === 'bindings' && bindings) {
      layer.bindings = bindings;
      hasBindings = true;
    } else if (property.name === 'sensor-bindings' && bindings) layer.sensorBindings = bindings;
    else layer.properties.push(property);
  }
  return hasBindings ? layer : null;
}

function stringValue(property: DtProperty): string | undefined {
  const [value, ...rest] = property.values;
  return value?.kind === 'string' && rest.length === 0 ? value.value : undefined;
}

function cellTokens(property: DtProperty): string[] | undefined {
  const [value, ...rest] = property.values;
  return value?.kind === 'cells' && rest.length === 0 ? value.tokens : undefined;
}

function firstLine(text: string): string {
  const line = text.split('\n')[0] ?? '';
  return line.length > 60 ? `${line.slice(0, 57)}...` : line;
}
