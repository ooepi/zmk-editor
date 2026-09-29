import { describe, expect, it } from 'vitest';
import { searchKeycodes } from '../catalog/keycodes.ts';
import { importKeymap } from './importer.ts';
import { behaviorTiles } from './palette.ts';
import { paletteSections } from './paletteSections.ts';

const SOURCE = `
#include <behaviors.dtsi>
/ {
    keymap {
        compatible = "zmk,keymap";
        base { display-name = "Base"; bindings = <&kp A &mo 1>; };
        nav { display-name = "Nav"; bindings = <&trans &trans>; };
    };
};`;

const tiles = behaviorTiles(importKeymap(SOURCE).model);
const titles = (query: string) => paletteSections(query, tiles).map((s) => s.title);

describe('paletteSections', () => {
  it('lists every key category and then the behavior groups when there is no search', () => {
    const all = titles('');
    expect(all.slice(0, 3)).toEqual(['Letters', 'Numbers', 'Symbols']);
    expect(all).toContain('Layers');
    expect(all.indexOf('Layers')).toBeGreaterThan(all.indexOf('Other'));
    expect(paletteSections('', tiles).every((s) => (s.kind === 'keys' ? s.keycodes.length : s.tiles.length) > 0)).toBe(true);
  });

  it('puts ranked key matches in one Keys section, then matching behavior groups', () => {
    const sections = paletteSections('esc', tiles);
    expect(sections[0]).toMatchObject({ id: 'keys', title: 'Keys', kind: 'keys' });
    expect(sections[0]?.kind === 'keys' && sections[0].keycodes).toEqual(searchKeycodes('esc'));
  });

  it('finds behaviors by words, and only the groups that match', () => {
    const found = titles('bluetooth');
    expect(found).toContain('Bluetooth & output');
    expect(found).not.toContain('Layers');
    expect(found).not.toContain('Letters');
  });

  it('returns nothing when nothing matches', () => {
    expect(paletteSections('zzzz', tiles)).toEqual([]);
  });
});
