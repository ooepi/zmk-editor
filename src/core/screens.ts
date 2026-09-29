import type { ZmkConfig } from './config.ts';
import {
  findScreen,
  NICE_VIEW_ADAPTER,
  SCREEN_SHIELDS,
  SCREENS,
  STOCK_SCREEN_SHIELD,
  type ScreenDef,
  type ScreenOption,
} from './catalog/screens.ts';
import { findModule } from './catalog/modules.ts';
import type { BuildTarget } from './files/build.ts';
import { readKconfigValue, writeKconfigValue } from './files/kconfig.ts';
import { addModule, removeModule } from './modules.ts';

/** A build with a nice!view, and the screen it shows. */
export interface ScreenSlot {
  /** Index in `build.yaml`'s include list. */
  index: number;
  /** "Left", "Right", or the build's shield when it isn't a half. */
  label: string;
  /** The catalog screen, or null for the stock one. */
  screen: ScreenDef | null;
  /** A screen shield the catalog doesn't know (added by hand). */
  otherShield?: string;
}

const names = (target: BuildTarget | undefined) => target?.shield?.split(/\s+/).filter(Boolean) ?? [];
const hasModule = (config: ZmkConfig, id: string) => config.west.modules.some((m) => m.name === id);

/** The catalog screen a shield name stands for; `nice_view_custom` is shared, so the one whose module is in west.yml. */
function screenForShield(config: ZmkConfig, shield: string): ScreenDef | undefined {
  const matches = SCREENS.filter((s) => s.shield === shield);
  return matches.find((s) => hasModule(config, s.moduleId)) ?? matches[0];
}

function slotLabel(base: string, target: BuildTarget, all: BuildTarget[]): string {
  const side = base.endsWith('_left') ? 'Left' : base.endsWith('_right') ? 'Right' : base || target.board;
  const same = all.filter((t) => names(t)[0] === base).length > 1;
  return same ? `${side} (${target.board})` : side;
}

/** Builds that use the nice!view adapter, in `build.yaml` order. */
export function screenSlots(config: ZmkConfig): ScreenSlot[] {
  const all = config.build.include;
  return all.flatMap((target, index): ScreenSlot[] => {
    const list = names(target);
    if (!list.includes(NICE_VIEW_ADAPTER)) return [];
    const label = slotLabel(list[0] ?? '', target, all);
    const shield = list.find((n) => SCREEN_SHIELDS.includes(n));
    if (!shield) {
      const after = list[list.indexOf(NICE_VIEW_ADAPTER) + 1];
      return [{ index, label, screen: null, ...(after ? { otherShield: after } : {}) }];
    }
    return [{ index, label, screen: shield === STOCK_SCREEN_SHIELD ? null : (screenForShield(config, shield) ?? null) }];
  });
}

/**
 * Why `screenId` can't go on build `index`: another build uses a screen that
 * defines the same shield or settings. Undefined when it can.
 */
export function screenConflict(config: ZmkConfig, index: number, screenId: string): string | undefined {
  const screen = findScreen(screenId);
  if (!screen?.conflictGroup) return undefined;
  const other = screenSlots(config).find(
    (s) => s.index !== index && s.screen && s.screen.id !== screen.id && s.screen.conflictGroup === screen.conflictGroup,
  );
  return other?.screen ? `Can’t be used next to ${other.screen.name} (${other.label}): they share internal names.` : undefined;
}

/** Whether any build still uses a shield from the module (a screen, or the module's own shield). */
function moduleInUse(config: ZmkConfig, moduleId: string): boolean {
  const shields = new Set([
    ...SCREENS.filter((s) => s.moduleId === moduleId).map((s) => s.shield),
    ...(findModule(moduleId)?.shield ? [findModule(moduleId)?.shield?.name ?? ''] : []),
  ]);
  return config.build.include.some((t) => names(t).some((n) => shields.has(n)));
}

/** Removes a module no build uses any more, with the `.conf` lines of settings no remaining screen has. */
function pruneModule(config: ZmkConfig, moduleId: string): ZmkConfig {
  if (!hasModule(config, moduleId) || moduleInUse(config, moduleId)) return config;
  let next = removeModule(config, moduleId).config;
  const kept = new Set(
    screenSlots(next).flatMap((s) => s.screen?.options.map((o) => o.symbol) ?? []),
  );
  for (const option of SCREENS.filter((s) => s.moduleId === moduleId).flatMap((s) => s.options)) {
    if (!kept.has(option.symbol)) next = { ...next, kconfig: writeKconfigValue(next.kconfig, option.symbol, undefined) };
  }
  return next;
}

/**
 * Puts a catalog screen (or the stock one, for null) on build `index`. Adds
 * its module to `west.yml` when needed and removes the old screen's module
 * once no build uses it. Throws on a conflict or a ZMK version the screen
 * has no release for.
 */
export function setScreen(config: ZmkConfig, index: number, screenId: string | null): ZmkConfig {
  const target = config.build.include[index];
  const list = names(target);
  if (!target || !list.includes(NICE_VIEW_ADAPTER)) throw new Error('That build has no nice!view.');
  const screen = screenId === null ? null : findScreen(screenId);
  if (screenId !== null && !screen) throw new Error(`Unknown screen ${screenId}`);

  const current = screenSlots(config).find((s) => s.index === index)?.screen ?? null;
  if ((current?.id ?? null) === (screen?.id ?? null)) return config;
  if (screen) {
    const conflict = screenConflict(config, index, screen.id);
    if (conflict) throw new Error(`${screen.name}: ${conflict}`);
  }

  let next = config;
  // Screens sharing a shield (nice_view_custom) can't both be in west.yml, so the old one goes first.
  // No other build can show it: that would be a conflict.
  if (current && screen && current.shield === screen.shield && current.moduleId !== screen.moduleId) {
    next = { ...next, west: { ...next.west, modules: next.west.modules.filter((m) => m.name !== current.moduleId) } };
  }
  if (screen && !hasModule(next, screen.moduleId)) next = addModule(next, screen.moduleId);
  const shield = screen?.shield ?? STOCK_SCREEN_SHIELD;
  const at = list.findIndex((n) => SCREEN_SHIELDS.includes(n));
  const updated = at >= 0 ? list.with(at, shield) : list.toSpliced(list.indexOf(NICE_VIEW_ADAPTER) + 1, 0, shield);
  next = {
    ...next,
    build: { ...next.build, include: next.build.include.with(index, { ...target, shield: updated.join(' ') }) },
  };
  return current && current.moduleId !== screen?.moduleId ? pruneModule(next, current.moduleId) : next;
}

/** Puts a screen on every nice!view build (the stock one for null). */
export function setScreenEverywhere(config: ZmkConfig, screenId: string | null): ZmkConfig {
  const slots = screenSlots(config);
  // Clear first, so a screen can replace a conflicting one on all halves at once.
  const cleared = screenId ? slots.reduce((c, s) => (s.screen?.id === screenId ? c : setScreen(c, s.index, null)), config) : config;
  return slots.reduce((c, s) => setScreen(c, s.index, screenId), cleared);
}

/** An option's value in `.conf`, or its default. */
export function readScreenOption(config: ZmkConfig, option: ScreenOption): boolean | number {
  const raw = readKconfigValue(config.kconfig, option.symbol);
  if (option.kind === 'bool') return raw === undefined ? option.default : raw === 'y';
  const value = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(value) ? value : option.default;
}

/** Sets an option in `.conf`; its default removes the line. */
export function setScreenOption(config: ZmkConfig, option: ScreenOption, value: boolean | number): ZmkConfig {
  const text = option.kind === 'bool' ? (value ? 'y' : 'n') : String(Math.round(Number(value)));
  const isDefault = option.kind === 'bool' ? value === option.default : Number(value) === option.default;
  return { ...config, kconfig: writeKconfigValue(config.kconfig, option.symbol, isDefault ? undefined : text) };
}
