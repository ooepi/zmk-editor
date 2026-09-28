import { describe, expect, it } from 'vitest';
import { formatBinding } from './bindings.ts';
import { copyKeys, pasteKeys } from './clipboard.ts';
import { copyBinding } from './edit.ts';
import { importKeymap } from './importer.ts';
import type { KeymapModel } from './model.ts';

const SOURCE = `
#include <behaviors.dtsi>
/ {
    keymap {
        compatible = "zmk,keymap";
        base { bindings = <&kp A &kp B &kp C &kp D>; };
        nav { bindings = <&trans &trans &trans &trans>; };
    };
};`;

const load = (): KeymapModel => importKeymap(SOURCE).model;
const layer = (model: KeymapModel | null, index: number) => model?.layers[index]?.bindings.map(formatBinding);

describe('copyKeys', () => {
  it('remembers the bindings, positions and layer in key order', () => {
    const clip = copyKeys(load(), 0, [2, 0]);
    expect(clip.layer).toBe(0);
    expect(clip.keys.map((k) => [k.index, formatBinding(k.binding)])).toEqual([
      [0, '&kp A'],
      [2, '&kp C'],
    ]);
  });

  it('skips keys that do not exist', () => {
    expect(copyKeys(load(), 0, [1, 9]).keys.map((k) => k.index)).toEqual([1]);
  });
});

describe('pasteKeys', () => {
  it('pastes several keys into the same positions on another layer', () => {
    const model = load();
    const next = pasteKeys(model, 1, copyKeys(model, 0, [0, 2]), []);
    expect(layer(next, 1)).toEqual(['&kp A', '&trans', '&kp C', '&trans']);
  });

  it('pastes one key onto every selected key', () => {
    const model = load();
    const next = pasteKeys(model, 1, copyKeys(model, 0, [1]), [0, 3]);
    expect(layer(next, 1)).toEqual(['&kp B', '&trans', '&trans', '&kp B']);
  });

  it('pastes one key onto other keys of the same layer', () => {
    const model = load();
    expect(layer(pasteKeys(model, 0, copyKeys(model, 0, [0]), [3]), 0)).toEqual(['&kp A', '&kp B', '&kp C', '&kp A']);
  });

  it('returns null when nothing would change', () => {
    const model = load();
    expect(pasteKeys(model, 0, copyKeys(model, 0, [0, 1]), [])).toBeNull();
    expect(pasteKeys(model, 1, copyKeys(model, 0, [0]), [])).toBeNull();
    expect(pasteKeys(model, 1, { layer: 0, keys: [] }, [0])).toBeNull();
  });

  it('ignores positions the keyboard does not have', () => {
    const model = load();
    const clip = { layer: 0, keys: [{ index: 7, binding: { behavior: 'kp', params: ['X'] } }, { index: 1, binding: { behavior: 'kp', params: ['Y'] } }] };
    expect(layer(pasteKeys(model, 1, clip, []), 1)).toEqual(['&trans', '&kp Y', '&trans', '&trans']);
  });
});

describe('copyBinding across layers', () => {
  it('copies a key from another layer', () => {
    expect(layer(copyBinding(load(), 1, 2, 0, 0), 1)).toEqual(['&kp C', '&trans', '&trans', '&trans']);
  });
});
