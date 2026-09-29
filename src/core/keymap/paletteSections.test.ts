import { describe, expect, it } from 'vitest';
import { searchKeycodes } from '../catalog/keycodes.ts';
import { importKeymap } from './importer.ts';
import { behaviorTiles } from './palette.ts';
import { COMMON_MEDIA, paletteSections, sectionInView } from './paletteSections.ts';

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

describe('palette section titles', () => {
  it('never shows two sections with the same title while searching', () => {
    for (const query of ['esc', 'caps', 'a', 'sticky']) {
      const found = titles(query);
      expect(new Set(found).size, query).toBe(found.length);
    }
  });

  it('calls the key behaviors group "Key behaviors"', () => {
    expect(titles('')).toContain('Key behaviors');
  });
});

describe('sectionInView', () => {
  const tops = [
    { id: 'a', top: 100 },
    { id: 'b', top: 300 },
    { id: 'c', top: 500 },
  ];

  it('picks the last section whose top has reached the top of the list, allowing for rounding', () => {
    expect(sectionInView(tops, 100, false, null)).toBe('a');
    expect(sectionInView(tops, 299.2, false, null)).toBe('b');
    expect(sectionInView(tops, 150, false, null)).toBe('a');
  });

  it('keeps the section jumped to when the list is scrolled to the bottom', () => {
    expect(sectionInView(tops, 100, true, 'c')).toBe('c');
    expect(sectionInView(tops, 100, true, null)).toBe('c');
  });

  it('is empty before the first section', () => {
    expect(sectionInView(tops, 0, false, null)).toBeNull();
  });
});

describe('media keys', () => {
  const browse = paletteSections('', tiles);
  const section = (title: string) => browse.find((s) => s.title === title);
  const tokens = (title: string) => {
    const s = section(title);
    return s?.kind === 'keys' ? s.keycodes.map((k) => k.name) : [];
  };

  it('keeps only the everyday media controls under Media, in a sensible order', () => {
    expect(tokens('Media')).toEqual([...COMMON_MEDIA]);
  });

  it('puts the rest under More media keys, last among the keys', () => {
    const titles = browse.map((s) => s.title);
    const more = titles.indexOf('More media keys');
    expect(more).toBeGreaterThan(titles.indexOf('Other'));
    expect(browse[more + 1]?.kind).toBe('behaviors');
    expect(tokens('More media keys')).toContain('C_AC_FORWARD');
    expect(tokens('More media keys')).not.toContain('C_VOLUME_UP');
  });

  it('still finds every media key by search', () => {
    const found = paletteSections('forward', tiles)[0];
    expect(found?.kind === 'keys' && found.keycodes.some((k) => k.name === 'C_AC_FORWARD')).toBe(true);
  });
});
