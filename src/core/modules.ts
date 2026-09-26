import type { TopLevelItem } from './dts/ast.ts';
import type { ZmkConfig } from './config.ts';
import { findModule, MODULES, type ModuleDef } from './catalog/modules.ts';
import { DEFAULT_UNICODE_MODE } from './catalog/unicode.ts';
import { ensureInclude } from './keymap/edit.ts';
import type { KeymapModel } from './keymap/model.ts';
import { mapAllBindings } from './keymap/traverse.ts';

/** Catalog modules listed in `west.yml`. */
export function installedModules(config: ZmkConfig): ModuleDef[] {
  return MODULES.filter((m) => config.west.modules.some((w) => w.name === m.id));
}

/** Adds a module to `west.yml` (following the ZMK version) and its headers to the keymap. */
export function addModule(config: ZmkConfig, id: string): ZmkConfig {
  const module = findModule(id);
  if (!module) throw new Error(`Unknown module ${id}`);
  if (config.west.modules.some((m) => m.name === id)) return config;
  const version = config.west.zmkVersion;
  if (!module.zmkVersions.includes(version)) {
    throw new Error(`${module.name} has no release for ZMK ${version}; it supports ${module.zmkVersions.join(', ')}.`);
  }
  const keymap = module.includes.reduce((k, path) => ensureInclude(k, path), config.keymap);
  const west = {
    ...config.west,
    modules: [...config.west.modules, { name: id, remote: module.remote.name, urlBase: module.remote.urlBase }],
  };
  return { ...config, west, keymap };
}

/**
 * Removes a module from `west.yml`, its headers and `&behavior { … }`
 * overrides. Bindings that used its behaviors become `&none`.
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
  return { config: { ...config, west, keymap }, replaced };
}

export type VersionChange = { ok: true; config: ZmkConfig } | { ok: false; blockedBy: string[] };

/**
 * Switches ZMK, every following module and the build workflow to `version`,
 * unless an installed module has no release for it.
 */
export function setZmkVersion(config: ZmkConfig, version: string): VersionChange {
  const blockedBy = installedModules(config)
    .filter((m) => !m.zmkVersions.includes(version))
    .map((m) => m.id);
  if (blockedBy.length > 0) return { ok: false, blockedBy };
  return { ok: true, config: { ...config, west: { ...config.west, zmkVersion: version } } };
}

/** Clears a module's pinned revision so it follows the ZMK version again. */
export function followZmkVersion(config: ZmkConfig, name: string): ZmkConfig {
  const modules = config.west.modules.map((m) => {
    if (m.name !== name) return m;
    const next = { ...m };
    delete next.revision;
    return next;
  });
  return { ...config, west: { ...config.west, modules } };
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
