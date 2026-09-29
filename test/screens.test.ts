import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateConfig, importConfig, type ZmkConfig } from '../src/core/config.ts';
import { SCREENS } from '../src/core/catalog/screens.ts';
import { setScreen } from '../src/core/screens.ts';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, 'fixtures/lily58', name), 'utf8');
const lily58 = () =>
  importConfig({
    'config/lily58.keymap': fixture('lily58.keymap'),
    'config/lily58.conf': fixture('lily58.conf'),
    'config/west.yml': fixture('west.yml'),
    'build.yaml': fixture('build.yaml'),
  }).config;

/**
 * Every catalog screen, spread over workspaces so that screens sharing
 * internal names never meet: the n-th workspace gets the n-th screen of each
 * conflict group and of the rest. Each screen is built for both halves
 * (central and peripheral code differ), and each workspace holds several
 * screen modules at once, as a keyboard with a different screen per half does.
 */
function workspaces(): string[][] {
  const groups = new Map<string, string[]>();
  for (const s of SCREENS) {
    const key = s.conflictGroup ?? 'none';
    groups.set(key, [...(groups.get(key) ?? []), s.id]);
  }
  const size = Math.max(...[...groups.values()].map((g) => g.length));
  return Array.from({ length: size }, (_, i) => [...groups.values()].flatMap((g) => (g[i] ? [g[i]] : [])));
}

function withScreens(ids: string[]): ZmkConfig {
  const base = lily58();
  const halves = base.build.include;
  let config: ZmkConfig = { ...base, build: { include: ids.flatMap(() => halves) } };
  ids.forEach((id, n) => {
    config = setScreen(setScreen(config, n * 2, id), n * 2 + 1, id);
  });
  return config;
}

// Built with ZMK in CI (.github/workflows/firmware.yml). Update with `npx vitest run -u`.
describe.each(workspaces().map((ids, i) => ({ name: `screens_${i + 1}`, ids })))('nice!view screens workspace $name', ({ name, ids }) => {
  const config = withScreens(ids);

  it('uses every screen on both halves', () => {
    expect(config.build.include.map((t) => t.shield?.split(' ').at(-1))).toEqual(
      ids.flatMap((id) => {
        const shield = SCREENS.find((s) => s.id === id)?.shield;
        return [shield, shield];
      }),
    );
  });

  it.each(Object.entries(generateConfig(config)))('matches the committed %s', async (path, content) => {
    await expect(content).toMatchFileSnapshot(join('generated', name, path));
  });
});

it('covers every screen once', () => {
  expect(workspaces().flat().sort()).toEqual(SCREENS.map((s) => s.id).sort());
});
