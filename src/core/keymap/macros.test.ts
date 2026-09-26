import { describe, expect, it } from 'vitest';
import { formatBinding } from './bindings.ts';
import { generateKeymap } from './generator.ts';
import { importKeymap } from './importer.ts';

const SOURCE = `
#define NAV 1
#define HRML(k1,k2) &ht LSHFT k1  &ht LALT k2
#define XXX &none
#define PAIR(a) HRML(a, a)
/ {
    keymap {
        compatible = "zmk,keymap";
        base { bindings = <&kp Q HRML(A,   S) XXX &mo NAV PAIR(Z)>; };
    };
};`;

describe('macros in bindings', () => {
  it('expands function-like and binding macros, keeping value macros', () => {
    const { model, warnings } = importKeymap(SOURCE);
    expect(model.layers[0]?.bindings.map(formatBinding)).toEqual([
      '&kp Q',
      '&ht LSHFT A',
      '&ht LALT S',
      '&none',
      '&mo NAV',
      '&ht LSHFT Z',
      '&ht LALT Z',
    ]);
    expect(warnings).toEqual([expect.stringMatching(/Expanded macros HRML, PAIR, XXX/)]);
  });

  it('round-trips after expansion', () => {
    const { model } = importKeymap(SOURCE);
    expect(importKeymap(generateKeymap(model)).model).toEqual(model);
  });

  it('leaves unknown function-like tokens alone', () => {
    const { model } = importKeymap('/ { keymap { compatible = "zmk,keymap"; l { bindings = <&kp LC(A)>; }; }; };');
    expect(model.layers[0]?.bindings.map(formatBinding)).toEqual(['&kp LC(A)']);
  });
});
