import { parse } from 'yaml';
import type { ImportResult } from '../keymap/importer.ts';
import { isRecord, optionalString, yamlScalar } from './yaml-util.ts';

export interface WestModule {
  name: string;
  remote: string;
  urlBase: string;
  /** A fixed ref. When absent, the module follows the ZMK version. */
  revision?: string;
  import?: string;
}

/**
 * The `west.yml` manifest. One `zmkVersion` pins ZMK, every module that
 * follows it, and the build workflow, so they can't drift apart.
 */
export interface WestModel {
  zmkVersion: string;
  modules: WestModule[];
  selfPath: string;
}

const ZMK_REMOTE = { name: 'zmkfirmware', urlBase: 'https://github.com/zmkfirmware' };

export function parseWestManifest(text: string): ImportResult<WestModel> {
  const doc: unknown = parse(text);
  const manifest = isRecord(doc) && isRecord(doc.manifest) ? doc.manifest : undefined;
  if (!manifest) throw new Error('west.yml has no manifest');

  const remotes = new Map<string, string>();
  for (const remote of Array.isArray(manifest.remotes) ? manifest.remotes : []) {
    if (isRecord(remote) && typeof remote.name === 'string' && typeof remote['url-base'] === 'string') {
      remotes.set(remote.name, remote['url-base'].replace(/\/+$/, ''));
    }
  }

  const warnings: string[] = [];
  const projects = (Array.isArray(manifest.projects) ? manifest.projects : []).filter(isRecord);
  const zmk = projects.find((p) => p.name === 'zmk');
  const zmkVersion = zmk && optionalString(zmk.revision);
  if (!zmkVersion) throw new Error('west.yml has no zmk project with a revision');

  const modules: WestModule[] = [];
  for (const project of projects) {
    if (project === zmk) continue;
    const name = optionalString(project.name);
    if (!name) {
      warnings.push('Skipped a west project without a name');
      continue;
    }
    let remote = optionalString(project.remote);
    let urlBase = remote ? remotes.get(remote) : undefined;
    const url = optionalString(project.url);
    if (!remote && url) {
      const match = /^(.*)\/([^/]+?)(\.git)?\/?$/.exec(url);
      urlBase = match?.[1];
      remote = urlBase?.split('/').at(-1);
      if (match?.[2] !== name) warnings.push(`west project ${name}: repository name differs from project name`);
    }
    if (!remote || !urlBase) {
      warnings.push(`Skipped west project ${name}: no remote or url`);
      continue;
    }
    const module: WestModule = { name, remote, urlBase };
    const revision = optionalString(project.revision);
    if (revision && revision !== zmkVersion) module.revision = revision;
    const imported = optionalString(project.import);
    if (imported) module.import = imported;
    else if (project.import !== undefined) warnings.push(`west project ${name}: complex import was dropped`);
    modules.push(module);
  }

  const self = isRecord(manifest.self) ? manifest.self : {};
  return { model: { zmkVersion, modules, selfPath: optionalString(self.path) ?? 'config' }, warnings };
}

export function generateWestManifest(model: WestModel): string {
  const remotes = new Map([[ZMK_REMOTE.name, ZMK_REMOTE.urlBase]]);
  for (const module of model.modules) if (!remotes.has(module.remote)) remotes.set(module.remote, module.urlBase);

  const lines = ['manifest:', '  remotes:'];
  for (const [name, urlBase] of remotes) lines.push(`    - name: ${yamlScalar(name)}`, `      url-base: ${yamlScalar(urlBase)}`);
  lines.push('  projects:');
  lines.push('    - name: zmk', `      remote: ${ZMK_REMOTE.name}`, `      revision: ${yamlScalar(model.zmkVersion)}`);
  lines.push('      import: app/west.yml');
  for (const module of model.modules) {
    lines.push(`    - name: ${yamlScalar(module.name)}`, `      remote: ${yamlScalar(module.remote)}`);
    lines.push(`      revision: ${yamlScalar(module.revision ?? model.zmkVersion)}`);
    if (module.import) lines.push(`      import: ${yamlScalar(module.import)}`);
  }
  lines.push('  self:', `    path: ${yamlScalar(model.selfPath)}`);
  return `${lines.join('\n')}\n`;
}

export interface VersionMismatch {
  module: string;
  revision: string;
  zmkVersion: string;
}

/** Modules pinned to a ref other than the ZMK version — the cause of broken builds. */
export function findVersionMismatches(model: WestModel): VersionMismatch[] {
  return model.modules.flatMap((m) =>
    m.revision ? [{ module: m.name, revision: m.revision, zmkVersion: model.zmkVersion }] : [],
  );
}
