import type { PhysicalLayout } from './types.ts';

export const layoutLabel = (name: string) => `${name.replace(/[^A-Za-z0-9_]/g, '_')}_layout`;

/**
 * A `zmk,physical-layout` node, indented for a root `/ { … }` block (1/100 key
 * units, rotation in centi-degrees). `extra` properties go after display-name.
 */
export function physicalLayoutNode(layout: PhysicalLayout, name: string, displayName = name, extra: string[] = []): string {
  const label = layoutLabel(name);
  const rows = layout.keys.map((k, i) => {
    const rot = Math.round(k.r * 100);
    const cells = [
      String(k.w).padStart(3),
      String(k.h).padStart(3),
      String(k.x).padStart(4),
      String(k.y).padStart(4),
      (rot < 0 ? `(${rot})` : String(rot)).padStart(6),
      String(k.rx).padStart(4),
      String(k.ry).padStart(4),
    ];
    return `            ${i === 0 ? '=' : ','} <&key_physical_attrs ${cells.join(' ')}>`;
  });
  return [
    `    ${label}: ${label} {`,
    '        compatible = "zmk,physical-layout";',
    `        display-name = "${displayName}";`,
    ...extra.map((line) => `        ${line}`),
    '',
    '        keys  //                     w   h    x    y     rot   rx   ry',
    ...rows,
    '            ;',
    '    };',
  ].join('\n');
}

/** A ZMK `zmk,physical-layout` node to paste into a shield definition. */
export function layoutDtsi(layout: PhysicalLayout, name: string): string {
  return `#include <physical_layouts.dtsi>\n\n/ {\n${physicalLayoutNode(layout, name)}\n};\n`;
}
