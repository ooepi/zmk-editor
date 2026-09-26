import { describe, expect, it } from 'vitest';
import { formatBinding } from '../keymap/bindings.ts';
import { importKeymap } from '../keymap/importer.ts';
import { resolveConditionals } from './conditionals.ts';

const KEYMAP = `
#define ANSI
//#define ISO
/ {
  keymap {
    compatible = "zmk,keymap";
    #ifdef ANSI
    base { bindings = <&kp A &kp B>; };
    #elif defined(ISO)
    base { bindings = <&kp C>; };
    #else
    #error "no layout"
    #endif
    #if !defined(ISO)
    other { bindings = <&kp D &kp E>; };
    #endif
  };
};
`;

describe('conditionals inside nodes', () => {
  it('keeps only the active branch and reports it', () => {
    const { model, warnings } = importKeymap(KEYMAP);
    expect(model.layers.map((l) => [l.name, l.bindings.map(formatBinding)])).toEqual([
      ['base', ['&kp A', '&kp B']],
      ['other', ['&kp D', '&kp E']],
    ]);
    expect(warnings).toEqual([expect.stringMatching(/#if/)]);
  });

  it('leaves top-level conditionals untouched', () => {
    const text = '#ifdef X\n&mmv { delay-ms = <0>; };\n#endif\n';
    expect(resolveConditionals(text)).toEqual({ text, resolved: false });
  });

  it('gives up on conditions it cannot evaluate', () => {
    const text = '/ {\n#if FOO > 2\na { };\n#endif\n};\n';
    expect(resolveConditionals(text).resolved).toBe(false);
  });
});
