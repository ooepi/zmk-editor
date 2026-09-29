import { describe, expect, it } from 'vitest';
import { pendingChanges } from './changes.ts';

describe('pendingChanges', () => {
  it('lists new and changed files, and nothing when the branch matches', () => {
    const generated = { 'config/a.keymap': 'new', 'build.yaml': 'same' };
    expect(pendingChanges(generated, { 'config/a.keymap': 'old', 'build.yaml': 'same' }, 'a')).toEqual([['config/a.keymap', 'new']]);
    expect(pendingChanges(generated, generated, 'a')).toEqual([]);
    expect(pendingChanges(generated, {}, 'a').map(([p]) => p)).toEqual(['config/a.keymap', 'build.yaml']);
  });
});
