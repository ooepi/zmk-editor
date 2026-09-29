import type { TopLevelItem } from './dts/ast.ts';
import type { ZmkConfig } from './config.ts';
import {
  findModule,
  moduleRevision,
  MODULES,
  supportedVersions,
  type BehaviorTemplate,
  type ModuleDef,
} from './catalog/modules.ts';
import { SCREENS, STOCK_SCREEN_SHIELD } from './catalog/screens.ts';
import { DEFAULT_UNICODE_MODE } from './catalog/unicode.ts';
import type { BuildModel } from './files/build.ts';
import { writeKconfigValue } from './files/kconfig.ts';
import { findVersionMismatches, type VersionMismatch, type WestModule } from './files/west.ts';
import { uniqueLabel } from './keymap/behaviorEdit.ts';
import { parseBehaviorSource } from './keymap/behaviorSource.ts';
import { ensureInclude } from './keymap/edit.ts';
import type { Behavior, KeymapModel } from './keymap/model.ts';
import { mapAllBindings } from './keymap/traverse.ts';

/** Catalog modules listed in `west.yml`. */
export function installedModules(config: ZmkConfig): ModuleDef[] {
  return MODULES.filter((m) => config.west.modules.some((w) => w.name === m.id));
}

/** The `west.yml` entry for a catalog module at a ZMK version; no revision means it follows ZMK. */
function westEntry(module: ModuleDef, zmkVersion: string): WestModule {
  const entry: WestModule = { name: module.id, remote: module.remote.name, urlBase: module.remote.urlBase };
  const revision = moduleRevision(module, zmkVersion);
  if (revision && revision !== zmkVersion) entry.revision = revision;
  return entry;
}

/**
 * Adds a module to `west.yml` at the revision matching the ZMK version, its
 * headers to the keymap, and the `.conf` settings it needs.
 */
export function addModule(config: ZmkConfig, id: string): ZmkConfig {
  const module = findModule(id);
  if (!module) throw new Error(`Unknown module ${id}`);
  if (config.west.modules.some((m) => m.name === id)) return config;
  const version = config.west.zmkVersion;
  if (!moduleRevision(module, version)) {
    throw new Error(`${module.name} has no release for ZMK ${version}; it supports ${supportedVersions(module).join(', ')}.`);
  }
  const keymap = module.includes.reduce((k, path) => ensureInclude(k, path), config.keymap);
  const kconfig = Object.entries(module.kconfig ?? {}).reduce((k, [name, value]) => writeKconfigValue(k, name, value), config.kconfig);
  const west = { ...config.west, modules: [...config.west.modules, westEntry(module, version)] };
  let next: ZmkConfig = { ...config, west, keymap, kconfig };
  const shield = module.shield;
  if (shield?.replaces) {
    next.build.include.forEach((target, index) => {
      if (shieldNames(target.shield).includes(shield.replaces ?? '')) next = setModuleShield(next, id, index, true);
    });
  }
  return next;
}

/**
 * Removes a module from `west.yml`, its headers, `&behavior { … }`
 * overrides and shield. Bindings that used its behaviors become `&none`.
 * Works for modules outside the catalog too (only `west.yml` changes).
 */
export function removeModule(config: ZmkConfig, id: string): { config: ZmkConfig; replaced: number } {
  const module = findModule(id);
  const refs = new Set(module?.behaviors.map((b) => b.ref) ?? []);
  const owned = (item: TopLevelItem) =>
    (item.kind === 'include' && (module?.includePrefixes.some((p) => item.path.startsWith(p)) ?? false)) ||
    (item.kind === 'override' && refs.has(item.node.name.slice(1)));

  let replaced = 0;
  const keymap = mapAllBindings({ ...config.keymap, topLevel: config.keymap.topLevel.filter((i) => !owned(i)) }, (b) => {
    if (!refs.has(b.behavior)) return b;
    replaced++;
    return { behavior: 'none', params: [] };
  });
  const west = { ...config.west, modules: config.west.modules.filter((m) => m.name !== id) };
  let next: ZmkConfig = { ...config, west, keymap };
  if (module?.shield) next.build.include.forEach((_, index) => (next = setModuleShield(next, id, index, false)));
  // Builds showing one of its nice!view screens go back to the stock screen.
  const screens = new Set(SCREENS.filter((s) => s.moduleId === id).map((s) => s.shield));
  if (screens.size > 0) {
    const include = next.build.include.map((t) => {
      const list = shieldNames(t.shield);
      return list.some((n) => screens.has(n)) ? { ...t, shield: list.map((n) => (screens.has(n) ? STOCK_SCREEN_SHIELD : n)).join(' ') } : t;
    });
    next = { ...next, build: { ...next.build, include } };
  }
  return { config: next, replaced };
}

export type VersionChange = { ok: true; config: ZmkConfig } | { ok: false; blockedBy: string[] };

/**
 * Switches ZMK, the build workflow and every module to `version`: modules
 * that follow ZMK move with it, and catalog modules move to their revision
 * for it. Refused when an installed module has no release for `version`.
 */
export function setZmkVersion(config: ZmkConfig, version: string): VersionChange {
  const installed = installedModules(config);
  const blockedBy = installed.filter((m) => !moduleRevision(m, version)).map((m) => m.id);
  if (blockedBy.length > 0) return { ok: false, blockedBy };
  const modules = config.west.modules.map((w) => {
    const module = installed.find((m) => m.id === w.name);
    if (!module || !isCatalogRevision(module, w, config.west.zmkVersion)) return w;
    const entry = westEntry(module, version);
    const next: WestModule = { ...w };
    if (entry.revision) next.revision = entry.revision;
    else delete next.revision;
    return next;
  });
  return { ok: true, config: { ...config, west: { ...config.west, zmkVersion: version, modules } } };
}

function isCatalogRevision(module: ModuleDef, entry: WestModule, zmkVersion: string): boolean {
  return (entry.revision ?? zmkVersion) === moduleRevision(module, zmkVersion);
}

/**
 * Modules pinned to a ref other than the ZMK version, except catalog
 * modules at the revision the catalog gives for it.
 */
export function moduleVersionMismatches(config: ZmkConfig): VersionMismatch[] {
  return findVersionMismatches(config.west).filter((m) => {
    const module = findModule(m.module);
    const entry = config.west.modules.find((w) => w.name === m.module);
    return !(module && entry && isCatalogRevision(module, entry, config.west.zmkVersion));
  });
}

/** Clears a module's pinned revision so it follows the ZMK version again (or the catalog's revision for it). */
export function followZmkVersion(config: ZmkConfig, name: string): ZmkConfig {
  const module = findModule(name);
  const modules = config.west.modules.map((m) => {
    if (m.name !== name) return m;
    const next = { ...m };
    const revision = module && westEntry(module, config.west.zmkVersion).revision;
    if (revision) next.revision = revision;
    else delete next.revision;
    return next;
  });
  return { ...config, west: { ...config.west, modules } };
}

function shieldNames(shield: string | undefined): string[] {
  return shield?.split(/\s+/).filter(Boolean) ?? [];
}

/** Whether a build target uses the module's shield. */
export function hasModuleShield(build: BuildModel, id: string, index: number): boolean {
  const shield = findModule(id)?.shield;
  return !!shield && shieldNames(build.include[index]?.shield).includes(shield.name);
}

/**
 * Adds or removes a module's shield on one build target. A shield that
 * replaces another (nice_view_gem for nice_view) swaps with it both ways.
 */
export function setModuleShield(config: ZmkConfig, id: string, index: number, on: boolean): ZmkConfig {
  const shield = findModule(id)?.shield;
  const target = config.build.include[index];
  if (!shield || !target) return config;
  let names = shieldNames(target.shield);
  if (on === names.includes(shield.name)) return config;
  if (on) {
    const at = shield.replaces ? names.indexOf(shield.replaces) : -1;
    if (at >= 0) names[at] = shield.name;
    else names.push(shield.name);
  } else if (shield.replaces && !names.includes(shield.replaces)) {
    names = names.map((n) => (n === shield.name ? shield.replaces ?? n : n));
  } else {
    names = names.filter((n) => n !== shield.name);
  }
  const next = { ...target };
  if (names.length > 0) next.shield = names.join(' ');
  else delete next.shield;
  return { ...config, build: { ...config.build, include: config.build.include.with(index, next) } };
}

/**
 * Adds a module's example behavior to the keymap, renamed if its label is
 * taken. Returns the new behavior's label.
 */
export function addTemplateBehavior(keymap: KeymapModel, template: BehaviorTemplate): { keymap: KeymapModel; label: string } {
  const parsed = parseBehaviorSource(template.source);
  if (!parsed.ok) throw new Error(`Bad template ${template.title}: ${parsed.error}`);
  const label = uniqueLabel(keymap, parsed.behavior.label ?? 'behavior');
  const behavior: Behavior = { ...parsed.behavior, label, name: label };
  return { keymap: { ...keymap, behaviors: [...keymap.behaviors, behavior] }, label };
}

/** A module outside the catalog, found on GitHub. */
export interface CustomModule {
  owner: string;
  repo: string;
  /** Git ref; omit to follow the ZMK version (the repo has a tag named like it). */
  revision?: string;
  /** Headers to add to the keymap, e.g. `behaviors/foo.dtsi`. */
  includes: string[];
}

/** Adds any GitHub module to `west.yml`, with a remote named after its owner. */
export function addCustomModule(config: ZmkConfig, module: CustomModule): ZmkConfig {
  if (config.west.modules.some((m) => m.name === module.repo)) {
    throw new Error(`west.yml already has a module named ${module.repo}.`);
  }
  const urlBase = `https://github.com/${module.owner}`;
  const clash = config.west.modules.find((m) => m.remote.toLowerCase() === module.owner.toLowerCase() && m.urlBase !== urlBase);
  const remote = clash ? `${module.owner}-${module.repo}` : module.owner.toLowerCase();
  const entry: WestModule = { name: module.repo, remote, urlBase };
  if (module.revision && module.revision !== config.west.zmkVersion) entry.revision = module.revision;
  const keymap = module.includes.reduce((k, path) => ensureInclude(k, path), config.keymap);
  return { ...config, keymap, west: { ...config.west, modules: [...config.west.modules, entry] } };
}

/** `owner/repo` from a GitHub URL or `owner/repo` text, or null. */
export function parseModuleRepo(input: string): { owner: string; repo: string } | null {
  const text = input.trim().replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '').replace(/(\.git)?\/*$/, '');
  const match = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)(\/.*)?$/.exec(text);
  return match?.[1] && match[2] ? { owner: match[1], repo: match[2] } : null;
}

function unicodeOverride(keymap: KeymapModel) {
  return keymap.topLevel.findIndex((i) => i.kind === 'override' && i.node.name === '&uc');
}

/** zmk-unicode's start-up input mode (`&uc { default-mode }`); WinCompose if unset. */
export function getUnicodeMode(keymap: KeymapModel): string {
  const item = keymap.topLevel[unicodeOverride(keymap)];
  if (item?.kind !== 'override') return DEFAULT_UNICODE_MODE;
  const value = item.node.properties.find((p) => p.name === 'default-mode')?.values[0];
  return value?.kind === 'cells' && value.tokens[0] ? value.tokens[0] : DEFAULT_UNICODE_MODE;
}

export function setUnicodeMode(keymap: KeymapModel, mode: string): KeymapModel {
  const property = { name: 'default-mode', values: [{ kind: 'cells' as const, tokens: [mode] }] };
  const index = unicodeOverride(keymap);
  const existing = keymap.topLevel[index];
  const topLevel = [...keymap.topLevel];
  if (existing?.kind === 'override') {
    const properties = existing.node.properties.some((p) => p.name === 'default-mode')
      ? existing.node.properties.map((p) => (p.name === 'default-mode' ? property : p))
      : [...existing.node.properties, property];
    topLevel[index] = { kind: 'override', node: { ...existing.node, properties } };
  } else {
    const after = topLevel.findLastIndex((i) => i.kind === 'include' || i.kind === 'define');
    topLevel.splice(after + 1, 0, { kind: 'override', node: { name: '&uc', labels: [], properties: [property], children: [] } });
  }
  return { ...keymap, topLevel };
}
