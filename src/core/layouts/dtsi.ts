import type { PhysicalLayout } from './types.ts';

/**
 * A ZMK `zmk,physical-layout` node (1/100 key units, rotation in
 * centi-degrees) to paste into a shield definition.
 */
export function layoutDtsi(layout: PhysicalLayout, name: string): string {
  const label = `${name.replace(/[^A-Za-z0-9_]/g, '_')}_layout`;
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
  return `#include <physical_layouts.dtsi>

/ {
    ${label}: ${label} {
        compatible = "zmk,physical-layout";
        display-name = "${name}";

        keys  //                     w   h    x    y     rot   rx   ry
${rows.join('\n')}
            ;
    };
};
`;
}
