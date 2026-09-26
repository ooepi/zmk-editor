import type { DtNode, DtProperty, DtValue } from './ast.ts';

export const INDENT = '    ';

export function printValue(value: DtValue): string {
  switch (value.kind) {
    case 'cells':
      return `<${value.tokens.join(' ')}>`;
    case 'string':
      return `"${value.value}"`;
    case 'bytes':
      return `[${value.tokens.join(' ')}]`;
    case 'ref':
      return `&${value.target}`;
  }
}

export function printProperty(property: DtProperty): string {
  if (property.values.length === 0) return `${property.name};`;
  return `${property.name} = ${property.values.map(printValue).join(', ')};`;
}

export function printNodeHeader(node: Pick<DtNode, 'name' | 'labels'>): string {
  return `${node.labels.map((l) => `${l}: `).join('')}${node.name} {`;
}

/** Prints a node at the given nesting depth; the result has no trailing newline. */
export function printNode(node: DtNode, depth: number): string {
  const pad = INDENT.repeat(depth);
  const inner = INDENT.repeat(depth + 1);
  const lines = [pad + printNodeHeader(node)];
  for (const property of node.properties) lines.push(inner + printProperty(property));
  node.children.forEach((child, index) => {
    if (index > 0 || node.properties.length > 0) lines.push('');
    lines.push(printNode(child, depth + 1));
  });
  lines.push(`${pad}};`);
  return lines.join('\n');
}
