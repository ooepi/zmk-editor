import { describe, expect, it } from 'vitest';
import appSource from './App.tsx?raw';
import { SHORTCUTS } from './shortcuts.ts';

/** The keys App's keydown handler compares `event.key` against. */
function handledKeys(source: string): string[] {
  const keys = new Set<string>();
  for (const [, key] of source.matchAll(/event\.key(?:\.toLowerCase\(\))? === '([^']+)'/g)) if (key) keys.add(key);
  for (const [, chars] of source.matchAll(/\/\^\[(\w+)\]\$\/i?\.test\(event\.key\)/g)) {
    for (const char of chars ?? '') keys.add(char);
  }
  return [...keys];
}

describe('SHORTCUTS', () => {
  it('lists every key the app handles', () => {
    const listed = new Set(SHORTCUTS.flatMap((s) => s.handles ?? []));
    const handled = handledKeys(appSource);
    expect(handled).toEqual(expect.arrayContaining(['z', 'y', 'Escape', 'a', 'c', 'x', 'v', 'Delete']));
    expect(handled.filter((key) => !listed.has(key))).toEqual([]);
  });
});
