import { generateBuildMatrix, parseBuildMatrix, type BuildModel } from './files/build.ts';
import { generateKconfig, parseKconfig, type KconfigModel } from './files/kconfig.ts';
import { generateWestManifest, parseWestManifest, type WestModel } from './files/west.ts';
import { generateWorkflow } from './files/workflow.ts';
import { definitionPath, parseHardware } from './hardware/definition.ts';
import { generateShield, handEditedShieldFiles } from './hardware/generate.ts';
import { hardwareLayout, type KeyboardHardware } from './hardware/types.ts';
import { validateHardware } from './hardware/validate.ts';
import { generateKeymap } from './keymap/generator.ts';
import { importKeymap } from './keymap/importer.ts';
import { emptyKeymap, type KeymapModel } from './keymap/model.ts';
import { textLayoutFor } from './layouts/index.ts';
import { generateInfoJson, parseInfoJson } from './layouts/qmkInfo.ts';
import type { PhysicalLayout } from './layouts/types.ts';

/** Everything the editor manages in a zmk-config repo. */
export interface ZmkConfig {
  /** Shield base name, e.g. `lily58`; names the `.keymap` and `.conf` files. */
  keyboard: string;
  keymap: KeymapModel;
  kconfig: KconfigModel;
  west: WestModel;
  build: BuildModel;
  /** A layout drawn in the designer, saved as `config/info.json`; overrides the catalog layout. */
  layout?: PhysicalLayout;
  /** A keyboard designed in the editor; its shield files are generated from it and it supplies the layout. */
  hardware?: KeyboardHardware;
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
    info: 'config/info.json',
  };
}

/** The layout the config draws for itself: a designed keyboard's, else the designer layout (info.json). */
export function customLayout(config: Pick<ZmkConfig, 'hardware' | 'layout'>): PhysicalLayout | undefined {
  return config.hardware ? hardwareLayout(config.hardware) : config.layout;
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
  const keyCount = keymap.layers[0]?.bindings.length ?? 0;

  const westText = files[paths.west];
  if (westText === undefined) throw new Error(`Missing ${paths.west}`);
  const west = parseWestManifest(westText);
  warnings.push(...west.warnings);

  const config: ZmkConfig = {
    keyboard: name,
    keymap,
    kconfig: parseKconfig(files[paths.kconfig] ?? ''),
    west: west.model,
    build: parseBuildMatrix(files[paths.build] ?? ''),
  };

  const definitionText = files[definitionPath(name)];
  if (definitionText !== undefined) {
    try {
      const hardware = parseHardware(definitionText);
      if (hardware.name !== name) {
        warnings.push(`Ignored ${definitionPath(name)}: it describes “${hardware.name}”, but the keymap is config/${name}.keymap.`);
      } else {
        config.hardware = hardware;
        if (hardware.keys.length !== keyCount) warnings.push(`The keyboard has ${hardware.keys.length} keys but the keymap has ${keyCount}.`);
        for (const issue of validateHardware(hardware)) {
          if (issue.level === 'error') warnings.push(`Keyboard hardware: ${issue.message}`);
        }
        for (const path of handEditedShieldFiles(files, name)) {
          warnings.push(`${path} was changed outside the editor; committing replaces it with the editor’s version.`);
        }
      }
    } catch (error) {
      warnings.push(`Ignored ${definitionPath(name)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const infoText = config.hardware ? undefined : files[paths.info];
  if (infoText !== undefined) {
    const layout = parseInfoJson(infoText);
    if (!layout) warnings.push(`Ignored ${paths.info}: it has no layout.`);
    else {
      config.layout = layout;
      if (layout.keys.length !== keyCount) {
        warnings.push(`${paths.info} has ${layout.keys.length} keys but the keymap has ${keyCount}; fix it in the layout designer.`);
      }
    }
  }
  return { config, warnings };
}

/** Writes every file the editor owns, including the build workflow. */
export function generateConfig(config: ZmkConfig): ConfigFiles {
  const paths = configPaths(config.keyboard);
  const keyCount = config.keymap.layers[0]?.bindings.length ?? 0;
  const files: ConfigFiles = {
    [paths.keymap]: generateKeymap(config.keymap, textLayoutFor(config.keyboard, keyCount, customLayout(config))),
    [paths.kconfig]: generateKconfig(config.kconfig),
    [paths.west]: generateWestManifest(config.west),
    [paths.build]: generateBuildMatrix(config.build),
    [paths.workflow]: generateWorkflow(config.west.zmkVersion),
  };
  if (config.hardware) Object.assign(files, generateShield(config.hardware));
  else if (config.layout) files[paths.info] = generateInfoJson(config.layout);
  return files;
}

function findKeyboard(files: ConfigFiles): string {
  const keymaps = Object.keys(files)
    .map((path) => /^config\/([^/]+)\.keymap$/.exec(path)?.[1])
    .filter((name): name is string => name !== undefined);
  const [only, ...rest] = keymaps;
  if (!only || rest.length > 0) throw new Error(`Expected one config/*.keymap, found ${keymaps.length}`);
  return only;
}
