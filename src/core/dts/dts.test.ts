import { describe, expect, it } from 'vitest';
import { stripComments } from './comments.ts';
import { tokenizeCells } from './cells.ts';
import { parseDts } from './parser.ts';
import { printNode } from './printer.ts';

describe('stripComments', () => {
  it('blanks line and block comments but keeps offsets and newlines', () => {
    const src = 'a // x\nb /* y\nz */ c';
    const out = stripComments(src);
    expect(out).toHaveLength(src.length);
    expect(out.split('\n')).toHaveLength(3);
    expect(out.replace(/\s+/g, ' ').trim()).toBe('a b c');
  });

  it('leaves comment markers inside strings alone', () => {
    expect(stripComments('label = "a // b";')).toBe('label = "a // b";');
  });
});

describe('tokenizeCells', () => {
  it('splits on whitespace and keeps parenthesised expressions whole', () => {
    expect(tokenizeCells('&kp LA(LC(TAB))  &bt BT_SEL 0\n&mt (LSHFT) A')).toEqual([
      '&kp',
      'LA(LC(TAB))',
      '&bt',
      'BT_SEL',
      '0',
      '&mt',
      '(LSHFT)',
      'A',
    ]);
  });

  it('keeps spaces inside parentheses', () => {
    expect(tokenizeCells('&kp LS( A ) 1')).toEqual(['&kp', 'LS( A )', '1']);
  });
});

describe('parseDts', () => {
  it('reads includes, defines and other directives in order', () => {
    const doc = parseDts(
      '#include <behaviors.dtsi>\n#define BASE 0\n#include "local.h"\n#define F(a, b) a b\n#ifdef X\n#endif\n',
    );
    expect(doc.items).toEqual([
      { kind: 'include', path: 'behaviors.dtsi', system: true },
      { kind: 'define', name: 'BASE', value: '0' },
      { kind: 'include', path: 'local.h', system: false },
      { kind: 'define', name: 'F', params: ['a', 'b'], value: 'a b' },
      { kind: 'directive', text: '#ifdef X' },
      { kind: 'directive', text: '#endif' },
    ]);
  });

  it('drops trailing comments from defines', () => {
    const doc = parseDts('#define MOVE 2400  // default: 600\n');
    expect(doc.items).toEqual([{ kind: 'define', name: 'MOVE', value: '2400' }]);
  });

  it('parses the root node with labels, properties and children', () => {
    const doc = parseDts(`
/ {
    behaviors {
        su: Scroller {
            compatible = "zmk,behavior-sensor-rotate";
            #sensor-binding-cells = <0>;
            bindings = <&msc SCRL_DOWN>, <&msc SCRL_UP>;
            hold-trigger-on-release;
            data = [01 02];
        };
    };
};`);
    const behavior = doc.root?.children[0]?.children[0];
    expect(behavior).toEqual({
      name: 'Scroller',
      labels: ['su'],
      properties: [
        { name: 'compatible', values: [{ kind: 'string', value: 'zmk,behavior-sensor-rotate' }] },
        { name: '#sensor-binding-cells', values: [{ kind: 'cells', tokens: ['0'] }] },
        {
          name: 'bindings',
          values: [
            { kind: 'cells', tokens: ['&msc', 'SCRL_DOWN'] },
            { kind: 'cells', tokens: ['&msc', 'SCRL_UP'] },
          ],
        },
        { name: 'hold-trigger-on-release', values: [] },
        { name: 'data', values: [{ kind: 'bytes', tokens: ['01', '02'] }] },
      ],
      children: [],
    });
  });

  it('merges repeated root nodes', () => {
    const doc = parseDts('/ { behaviors { a: a { x = <1>; }; }; };\n/ { behaviors { b: b { }; }; combos { }; };');
    expect(doc.root?.children.map((c) => c.name)).toEqual(['behaviors', 'combos']);
    expect(doc.root?.children[0]?.children.map((c) => c.name)).toEqual(['a', 'b']);
  });

  it('reads &label overrides as top-level items', () => {
    const doc = parseDts('&mmv {\n  delay-ms = <0>; // c\n};');
    expect(doc.items).toEqual([
      {
        kind: 'override',
        node: {
          name: '&mmv',
          labels: [],
          properties: [{ name: 'delay-ms', values: [{ kind: 'cells', tokens: ['0'] }] }],
          children: [],
        },
      },
    ]);
  });

  it('keeps macro invocations and unparseable items as raw text', () => {
    const doc = parseDts('ZMK_COMBO(esc, &kp ESC, 0 1, BASE)\n&foo { /delete-property/ x; };\nZMK_X(a);\n');
    expect(doc.items).toEqual([
      { kind: 'raw', text: 'ZMK_COMBO(esc, &kp ESC, 0 1, BASE)' },
      { kind: 'raw', text: '&foo { /delete-property/ x; };' },
      { kind: 'raw', text: 'ZMK_X(a);' },
    ]);
  });

  it('keeps an unparseable root node as raw text instead of failing', () => {
    const doc = parseDts('/ { a { /delete-node/ b; }; };');
    expect(doc.root).toBeNull();
    expect(doc.items).toEqual([{ kind: 'raw', text: '/ { a { /delete-node/ b; }; };' }]);
  });
});

describe('printNode', () => {
  it('prints nodes deterministically and re-parses to the same tree', () => {
    const src = '/ { n: node { a = <1 2>, <&x>; b = "s"; c; d = [0a]; e = &y; child { }; }; };';
    const node = parseDts(src).root?.children[0];
    if (!node) throw new Error('no node');
    const printed = printNode(node, 0);
    expect(printed).toBe(
      ['n: node {', '    a = <1 2>, <&x>;', '    b = "s";', '    c;', '    d = [0a];', '    e = &y;', '', '    child {', '    };', '};'].join(
        '\n',
      ),
    );
    expect(parseDts(`/ {\n${printed}\n};`).root?.children[0]).toEqual(node);
  });
});
