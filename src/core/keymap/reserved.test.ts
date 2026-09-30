import { describe, expect, it } from 'vitest';
import { generateKeymap } from './generator.ts';
import { importKeymap } from './importer.ts';

const SOURCE = `/ {
    keymap {
        compatible = "zmk,keymap";

        base {
            bindings = <&kp A &kp B>;
        };

        extra1 {
            status = "reserved";
        };

        extra2 {
            status = "reserved";
        };
    };
};
`;

describe('reserved layers', () => {
  it('are kept apart from the active layers, without a warning', () => {
    const { model, warnings } = importKeymap(SOURCE);
    expect(model.layers.map((l) => l.name)).toEqual(['base']);
    expect(model.reservedLayers?.map((n) => n.name)).toEqual(['extra1', 'extra2']);
    expect(model.extraNodes).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('are written after the active layers, inside the keymap node', () => {
    const text = generateKeymap(importKeymap(SOURCE).model);
    const keymap = text.slice(text.indexOf('keymap {'));
    expect(keymap.indexOf('base {')).toBeLessThan(keymap.indexOf('extra1 {'));
    expect(keymap).toContain('extra1 {\n            status = "reserved";\n        };');
    expect(keymap.indexOf('extra2 {')).toBeLessThan(keymap.indexOf('\n    };'));
    expect(importKeymap(text).model.reservedLayers?.map((n) => n.name)).toEqual(['extra1', 'extra2']);
  });
});
