import type { TopLevelItem } from '../dts/ast.ts';
import { INDENT, printNode, printNodeHeader, printProperty } from '../dts/printer.ts';
import type { TextLayout } from '../layouts/types.ts';
import { layoutKeyCount } from '../layouts/types.ts';
import { formatBinding } from './bindings.ts';
import { bindingLabel } from './labels.ts';
import { sensorBindingsForZmk } from './sensorEdit.ts';
import type { Behavior, Binding, Combo, KeymapModel, Layer } from './model.ts';
import { behaviorKind } from './model.ts';

const FALLBACK_ROW_LENGTH = 12;

/**
 * Generates a `.keymap` file. The output is deterministic: the same model
 * always gives the same text.
 */
export function generateKeymap(model: KeymapModel, layout?: TextLayout): string {
  const sections: string[] = [];
  const topLevel = printTopLevel(model.topLevel);
  if (topLevel) sections.push(topLevel);

  const rootParts: string[] = [];
  if (model.rootProperties.length > 0) rootParts.push(model.rootProperties.map((p) => INDENT + printProperty(p)).join('\n'));

  const macros = model.behaviors.filter((b) => behaviorKind(b) === 'macro');
  const others = model.behaviors.filter((b) => behaviorKind(b) !== 'macro');
  if (others.length > 0) rootParts.push(container('behaviors', undefined, others.map(printBehavior)));
  if (macros.length > 0) rootParts.push(container('macros', undefined, macros.map(printBehavior)));
  if (model.combos.length > 0) rootParts.push(container('combos', 'zmk,combos', model.combos.map(printCombo)));
  if (model.layers.length > 0) {
    rootParts.push(container('keymap', 'zmk,keymap', model.layers.map((l) => printLayer(l, model.layers, layout))));
  }
  for (const node of model.extraNodes) rootParts.push(printNode(node, 1));

  if (rootParts.length > 0) sections.push(['/ {', rootParts.join('\n\n'), '};'].join('\n'));
  return `${sections.join('\n\n')}\n`;
}

type Category = 'include' | 'define' | 'directive' | 'block';

function category(item: TopLevelItem): Category {
  if (item.kind === 'include' || item.kind === 'define' || item.kind === 'directive') return item.kind;
  return 'block';
}

/** Directives of one kind stay together; blocks are separated by blank lines. */
function printTopLevel(items: TopLevelItem[]): string {
  const lines: string[] = [];
  let previous: Category | undefined;
  for (const item of items) {
    const current = category(item);
    if (previous && (current !== previous || current === 'block')) lines.push('');
    lines.push(printTopLevelItem(item));
    previous = current;
  }
  return lines.join('\n');
}

function printTopLevelItem(item: TopLevelItem): string {
  switch (item.kind) {
    case 'include':
      return item.system ? `#include <${item.path}>` : `#include "${item.path}"`;
    case 'define': {
      const head = item.params ? `${item.name}(${item.params.join(', ')})` : item.name;
      return item.value ? `#define ${head} ${item.value}` : `#define ${head}`;
    }
    case 'directive':
    case 'raw':
      return item.text;
    case 'override':
      return printNode(item.node, 0);
  }
}

function container(name: string, compatible: string | undefined, children: string[]): string {
  const lines = [`${INDENT}${name} {`];
  if (compatible) lines.push(`${INDENT.repeat(2)}compatible = "${compatible}";`, '');
  lines.push(children.join('\n\n'));
  lines.push(`${INDENT}};`);
  return lines.join('\n');
}

function bindingGroups(bindings: Binding[]): string {
  return bindings.map((b) => `<${formatBinding(b)}>`).join(', ');
}

function printBehavior(behavior: Behavior): string {
  const pad = INDENT.repeat(2);
  const inner = INDENT.repeat(3);
  const lines = [pad + printNodeHeader({ name: behavior.name, labels: behavior.label ? [behavior.label] : [] })];
  lines.push(`${inner}compatible = "${behavior.compatible}";`);
  for (const property of behavior.properties) lines.push(inner + printProperty(property));
  if (behavior.bindings.length > 0) lines.push(`${inner}bindings = ${bindingGroups(behavior.bindings)};`);
  for (const child of behavior.children ?? []) lines.push('', printNode(child, 3));
  lines.push(`${pad}};`);
  return lines.join('\n');
}

function printCombo(combo: Combo): string {
  const pad = INDENT.repeat(2);
  const inner = INDENT.repeat(3);
  const lines = [`${pad}${combo.name} {`];
  for (const property of combo.properties) lines.push(inner + printProperty(property));
  lines.push(`${inner}key-positions = <${combo.keyPositions.join(' ')}>;`);
  lines.push(`${inner}bindings = <${formatBinding(combo.binding)}>;`);
  if (combo.layers) lines.push(`${inner}layers = <${combo.layers.join(' ')}>;`);
  lines.push(`${pad}};`);
  return lines.join('\n');
}

function printLayer(layer: Layer, layers: Layer[], layout: TextLayout | undefined): string {
  const pad = INDENT.repeat(2);
  const inner = INDENT.repeat(3);
  const lines = [pad + printNodeHeader({ name: layer.name, labels: layer.label ? [layer.label] : [] })];
  if (layer.displayName !== undefined) lines.push(`${inner}display-name = "${layer.displayName}";`);
  for (const property of layer.properties) lines.push(inner + printProperty(property));

  const grid = layout && layoutKeyCount(layout) === layer.bindings.length ? layout.rows : fallbackRows(layer.bindings.length);
  const labels = layer.bindings.map((b) => bindingLabel(b, layers));
  for (const row of alignGrid(grid, labels, 1, true)) lines.push(`${inner}// ${row}`);
  lines.push(`${inner}bindings = <`);
  for (const row of alignGrid(grid, layer.bindings.map(formatBinding), 0, false)) lines.push(`${INDENT.repeat(4)}${row}`);
  lines.push(`${inner}>;`);

  // Written the way ZMK can compile them: no &trans/&none (see sensorBindingsForZmk).
  const sensorBindings = sensorBindingsForZmk({ layers })[layers.indexOf(layer)];
  if (sensorBindings) {
    lines.push('', `${inner}sensor-bindings = <${sensorBindings.map(formatBinding).join(' ')}>;`);
  }
  lines.push(`${pad}};`);
  return lines.join('\n');
}

function fallbackRows(count: number): number[][] {
  const rows: number[][] = [];
  for (let i = 0; i < count; i += FALLBACK_ROW_LENGTH) {
    rows.push(Array.from({ length: Math.min(FALLBACK_ROW_LENGTH, count - i) }, (_, j) => i + j));
  }
  return rows;
}

/**
 * Lays out cells on a grid with per-column widths. As a table (`boxed`) each
 * key is `| label |`; otherwise cells are separated by two spaces.
 */
function alignGrid(rows: (number | null)[][], cells: string[], minWidth: number, boxed: boolean): string[] {
  const columns = Math.max(...rows.map((r) => r.length));
  const widths = Array.from({ length: columns }, (_, c) =>
    Math.max(minWidth, ...rows.map((r) => (r[c] == null ? 0 : (cells[r[c]]?.length ?? 0)))),
  );
  return rows.map((row) => {
    let out = '';
    for (let c = 0; c < columns; c++) {
      const key = row[c];
      const width = widths[c] ?? 0;
      const previousIsKey = c > 0 && row[c - 1] != null;
      if (boxed) {
        if (key != null) out += `| ${(cells[key] ?? '').padEnd(width)} `;
        else out += `${previousIsKey ? '|' : ' '}${' '.repeat(width + 2)}`;
      } else {
        if (c > 0) out += '  ';
        out += key != null ? (cells[key] ?? '').padEnd(width) : ' '.repeat(width);
      }
    }
    if (boxed && row[columns - 1] != null) out += '|';
    return out.trimEnd();
  });
}
