import { describe, expect, it } from 'vitest';
import { createBehavior } from './behaviorEdit.ts';
import { getConditionalLayers, setConditionalLayers } from './conditional.ts';
import { deleteLayer } from './edit.ts';
import { generateKeymap } from './generator.ts';
import { importKeymap } from './importer.ts';
import { emptyKeymap } from './model.ts';

const SOURCE = `/ {
    conditional_layers {
        compatible = "zmk,conditional-layers";
        tri { if-layers = <1 2>; then-layer = <3>; };
    };
    keymap { compatible = "zmk,keymap"; a { bindings = <&kp A>; }; b { bindings = <&kp B>; }; c { bindings = <&kp C>; }; d { bindings = <&kp D>; }; };
};`;

describe('conditional layers', () => {
  it('reads them from the keymap', () => {
    expect(getConditionalLayers(importKeymap(SOURCE).model)).toEqual([{ name: 'tri', ifLayers: ['1', '2'], thenLayer: '3' }]);
  });

  it('writes them back and round-trips', () => {
    const model = setConditionalLayers(importKeymap(SOURCE).model, [
      { name: 'tri', ifLayers: ['1', '2'], thenLayer: '3' },
      { name: 'other', ifLayers: ['0', '1'], thenLayer: '2' },
    ]);
    const text = generateKeymap(model);
    expect(text).toContain('if-layers = <0 1>;');
    expect(getConditionalLayers(importKeymap(text).model)).toHaveLength(2);
  });

  it('creates the node when there is none, and removes it when empty', () => {
    const added = setConditionalLayers(emptyKeymap(), [{ name: 'tri', ifLayers: ['1', '2'], thenLayer: '3' }]);
    expect(generateKeymap(added)).toContain('compatible = "zmk,conditional-layers";');
    expect(setConditionalLayers(added, []).extraNodes).toEqual([]);
  });

  it('is renumbered when layers are deleted', () => {
    const { model } = deleteLayer(importKeymap(SOURCE).model, 0);
    expect(getConditionalLayers(model)).toEqual([{ name: 'tri', ifLayers: ['0', '1'], thenLayer: '2' }]);
  });
});

describe('tap-dance', () => {
  it('creates a tap-dance with two taps and a tapping term', () => {
    const td = createBehavior(emptyKeymap(), 'tap-dance');
    expect(td).toMatchObject({ label: 'td', compatible: 'zmk,behavior-tap-dance' });
    expect(generateKeymap({ ...emptyKeymap(), behaviors: [td] })).toContain('tapping-term-ms = <200>;');
    expect(td.bindings).toHaveLength(2);
  });
});
