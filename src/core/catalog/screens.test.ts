import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findModule, moduleRevision } from './modules.ts';
import { SCREENS } from './screens.ts';

describe('screen catalog', () => {
  it('has unique ids and a module for every screen', () => {
    expect(new Set(SCREENS.map((s) => s.id)).size).toBe(SCREENS.length);
    for (const screen of SCREENS) expect(findModule(screen.moduleId), screen.id).toBeDefined();
  });

  it('shares a shield only between screens that are marked as conflicting', () => {
    for (const a of SCREENS) {
      for (const b of SCREENS) {
        if (a.id !== b.id && a.shield === b.shield) expect(a.conflictGroup, `${a.id} / ${b.id}`).toBe(b.conflictGroup);
      }
    }
  });

  it('pins every module to a tag or full commit for ZMK v0.3', () => {
    for (const screen of SCREENS) {
      const module = findModule(screen.moduleId);
      if (!module) throw new Error(screen.moduleId);
      expect(moduleRevision(module, 'v0.3'), screen.id).toMatch(/^([0-9a-f]{40}|v\d+\.\d+\.\d+)$/);
    }
  });

  it('credits every creator and keeps each license notice', () => {
    for (const screen of SCREENS) {
      expect(screen.creator.url).toBe(`https://github.com/${screen.creator.name}`);
      expect(screen.homepage).toMatch(/^https:\/\/github\.com\//);
      expect(screen.license).toMatch(/^MIT, © \d{4} /);
    }
  });

  it('has a bundled preview for every image, made from a pinned source', () => {
    for (const preview of SCREENS.flatMap((s) => s.previews)) {
      expect(preview.source).toMatch(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[0-9a-f]{40}\//);
      expect(existsSync(join(import.meta.dirname, '../../../public/screens', preview.file)), preview.file).toBe(true);
    }
  });

  it('uses only CONFIG_ option symbols with sane defaults', () => {
    for (const option of SCREENS.flatMap((s) => s.options)) {
      expect(option.symbol).toMatch(/^CONFIG_[A-Z0-9_]+$/);
      if (option.kind === 'int') expect(option.default).toBeGreaterThanOrEqual(option.min ?? 0);
    }
  });
});
