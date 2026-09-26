import type { BehaviorDef } from './behaviors.ts';

/** ZMK releases the editor can target, newest first. */
export const ZMK_VERSIONS = ['v0.3', 'v0.2', 'v0.1'];

export interface ModuleDef {
  /** The west project name. */
  id: string;
  name: string;
  description: string;
  homepage: string;
  remote: { name: string; urlBase: string };
  /** ZMK versions the module has a matching tag for. */
  zmkVersions: string[];
  /** Headers added to the keymap with the module. */
  includes: string[];
  /** Includes starting with these belong to the module (removed with it). */
  includePrefixes: string[];
  /** Behaviors the module defines once included. */
  behaviors: BehaviorDef[];
}

const UROB = { name: 'urob', urlBase: 'https://github.com/urob' };

export const MODULES: ModuleDef[] = [
  {
    id: 'zmk-helpers',
    name: 'ZMK helpers',
    description: 'Preprocessor helpers (ZMK_COMBO, ZMK_HOLD_TAP, key position labels…) for writing keymaps by hand.',
    homepage: 'https://github.com/urob/zmk-helpers',
    remote: UROB,
    zmkVersions: ['v0.3', 'v0.2', 'v0.1'],
    includes: ['zmk-helpers/helper.h'],
    includePrefixes: ['zmk-helpers/'],
    behaviors: [],
  },
  {
    id: 'zmk-unicode',
    name: 'Unicode',
    description: 'Type any character, such as ä, ö and å, with &uc. Needs a Unicode input method on the computer.',
    homepage: 'https://github.com/urob/zmk-unicode',
    remote: UROB,
    zmkVersions: ['v0.3'],
    includes: ['behaviors/unicode.dtsi'],
    includePrefixes: ['behaviors/unicode.dtsi', 'zmk-unicode/'],
    behaviors: [
      {
        ref: 'uc',
        name: 'Unicode character',
        description: 'Types a character through the computer’s Unicode input (zmk-unicode).',
        group: 'module',
        params: [{ kind: 'unicode' }],
      },
    ],
  },
  {
    id: 'zmk-auto-layer',
    name: 'Auto layer (num-word)',
    description: 'Adds &num_word: a layer that stays on while you type numbers and turns off on any other key.',
    homepage: 'https://github.com/urob/zmk-auto-layer',
    remote: UROB,
    zmkVersions: ['v0.3', 'v0.2', 'v0.1'],
    includes: ['behaviors/num_word.dtsi'],
    includePrefixes: ['behaviors/num_word.dtsi', 'behaviors/auto_layer'],
    behaviors: [
      {
        ref: 'num_word',
        name: 'Num word',
        description: 'Turns on a layer until a key outside it (not a number) is pressed (zmk-auto-layer).',
        group: 'module',
        params: [{ kind: 'layer' }],
      },
    ],
  },
];

export function findModule(id: string): ModuleDef | undefined {
  return MODULES.find((m) => m.id === id);
}

/** Catalog modules whose headers the keymap includes. */
export function modulesIncludedBy(includePaths: string[]): ModuleDef[] {
  return MODULES.filter((m) => includePaths.some((path) => m.includePrefixes.some((prefix) => path.startsWith(prefix))));
}
