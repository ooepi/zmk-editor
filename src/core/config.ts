import { generateBuildMatrix, parseBuildMatrix, type BuildModel } from './files/build.ts';
import { generateKconfig, parseKconfig, type KconfigModel } from './files/kconfig.ts';
import { generateWestManifest, parseWestManifest, type WestModel } from './files/west.ts';
import { generateWorkflow } from './files/workflow.ts';
import { generateKeymap } from './keymap/generator.ts';
import { importKeymap } from './keymap/importer.ts';
import { emptyKeymap, type KeymapModel } from './keymap/model.ts';
import { getTextLayout } from './layouts/index.ts';

/** Everything the editor manages in a zmk-config repo. */
export interface ZmkConfig {
  /** Shield base name, e.g. `lily58`; names the `.keymap` and `.conf` files. */
  keyboard: string;
  keymap: KeymapModel;
  kconfig: KconfigModel;
  west: WestModel;
  build: BuildModel;
}

/** Repo path → file contents. */
export type ConfigFiles = Record<string, string>;

export function configPaths(keyboard: string) {
  return {
    keymap: `config/${keyboard}.keymap`,
    kconfig: `config/${keyboard}.conf`,
    west: 'config/west.yml',
    build: 'build.yaml',
    workflow: '.github/workflows/build.yml',
  };
}

/** Reads a zmk-config repo. `keyboard` defaults to the only `config/*.keymap`. */
export function importConfig(files: ConfigFiles, keyboard?: string): { config: ZmkConfig; warnings: string[] } {
  const name = keyboard ?? findKeyboard(files);
  const paths = configPaths(name);
  const warnings: string[] = [];

  const keymapText = files[paths.keymap];
  let keymap = emptyKeymap();
  if (keymapText === undefined) warnings.push(`Missing ${paths.keymap}`);
  else {
    const result = importKeymap(keymapText);
    keymap = result.model;
    warnings.push(...result.warnings);
  }

  const westText = files[paths.west];
  if (westText === undefined) throw new Error(`Missing ${paths.west}`);
  const west = parseWestManifest(westText);
  warnings.push(...west.warnings);

  return {
    config: {
      keyboard: name,
      keymap,
      kconfig: parseKconfig(files[paths.kconfig] ?? ''),
      west: west.model,
      build: parseBuildMatrix(files[paths.build] ?? ''),
    },
    warnings,
  };
}

/** Writes every file the editor owns, including the build workflow. */
export function generateConfig(config: ZmkConfig): ConfigFiles {
  const paths = configPaths(config.keyboard);
  return {
    [paths.keymap]: generateKeymap(config.keymap, getTextLayout(config.keyboard)),
    [paths.kconfig]: generateKconfig(config.kconfig),
    [paths.west]: generateWestManifest(config.west),
    [paths.build]: generateBuildMatrix(config.build),
    [paths.workflow]: generateWorkflow(config.west.zmkVersion),
  };
}

function findKeyboard(files: ConfigFiles): string {
  const keymaps = Object.keys(files)
    .map((path) => /^config\/([^/]+)\.keymap$/.exec(path)?.[1])
    .filter((name): name is string => name !== undefined);
  const [only, ...rest] = keymaps;
  if (!only || rest.length > 0) throw new Error(`Expected one config/*.keymap, found ${keymaps.length}`);
  return only;
}
