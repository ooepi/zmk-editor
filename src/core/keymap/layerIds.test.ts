import { describe, expect, it } from 'vitest';
import { generateKeymap } from './generator.ts';
import { importKeymap } from './importer.ts';
import { withLayerUids } from './layerIds.ts';
import { addLayer, moveLayer, renameLayer } from './edit.ts';

const model = () =>
  importKeymap(`/ {
    keymap {
        compatible = "zmk,keymap";
        base { bindings = <&kp A>; };
        nav { bindings = <&trans>; };
    };
};
`).model;

describe('withLayerUids', () => {
  it('gives every layer a distinct uid', () => {
    const [a, b] = withLayerUids(model()).layers;
    expect(a?.uid).toBeTypeOf('number');
    expect(b?.uid).toBeTypeOf('number');
    expect(a?.uid).not.toBe(b?.uid);
  });

  it('returns the same model when every layer has one', () => {
    const once = withLayerUids(model());
    expect(withLayerUids(once)).toBe(once);
  });

  it('keeps uids through rename and move, and gives an added layer a new one', () => {
    const start = withLayerUids(model());
    const uids = start.layers.map((l) => l.uid);
    expect(renameLayer(start, 1, 'Navigation').layers[1]?.uid).toBe(uids[1]);
    expect(moveLayer(start, 1, 0).layers.map((l) => l.uid)).toEqual([uids[1], uids[0]]);
    const added = withLayerUids(addLayer(start, 'Sym')).layers[2]?.uid;
    expect(added).toBeTypeOf('number');
    expect(uids).not.toContain(added);
  });

  it('does not change the generated keymap', () => {
    const plain = model();
    expect(generateKeymap(withLayerUids(plain))).toBe(generateKeymap(plain));
  });
});

describe('withLayerUids after a reload', () => {
  it('never reuses a uid already in the model (stored configs keep theirs)', () => {
    const stored = { ...model(), layers: model().layers.map((l, i) => ({ ...l, uid: 1_000_000 + i })) };
    const added = withLayerUids(addLayer(withLayerUids(stored), 'New'));
    expect(added.layers[2]?.uid).toBeGreaterThan(1_000_001);
  });
});
