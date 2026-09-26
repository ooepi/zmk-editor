import type { BehaviorDef } from './behaviors.ts';

/** ZMK releases the editor can target, newest first. */
export const ZMK_VERSIONS = ['v0.3', 'v0.2', 'v0.1'];

export type ModuleCategory = 'behaviors' | 'lighting' | 'display' | 'helpers';

export const MODULE_CATEGORIES: { id: ModuleCategory; label: string }[] = [
  { id: 'behaviors', label: 'Behaviors' },
  { id: 'lighting', label: 'LEDs' },
  { id: 'display', label: 'Displays' },
  { id: 'helpers', label: 'Helpers' },
];

/** An example behavior node a module needs the keymap to define before it does anything. */
export interface BehaviorTemplate {
  /** Button text, e.g. "Leader key". */
  title: string;
  /** Devicetree source of one labelled behavior node. */
  source: string;
}

/** A shield the module provides, added next to the keyboard's shield in `build.yaml`. */
export interface ModuleShield {
  name: string;
  /** A shield it takes the place of, e.g. `nice_view` for a nice!view status screen. */
  replaces?: string;
  /** Which builds should get it. */
  help: string;
}

export interface ModuleDef {
  /** The west project name. */
  id: string;
  name: string;
  category: ModuleCategory;
  description: string;
  homepage: string;
  remote: { name: string; urlBase: string };
  /**
   * The module's git ref for each ZMK version it supports. A ref equal to
   * the ZMK version means the module follows ZMK in `west.yml`.
   */
  revisions: Record<string, string>;
  /** Headers added to the keymap with the module. */
  includes: string[];
  /** Includes starting with these belong to the module (removed with it). */
  includePrefixes: string[];
  /** Behaviors the module defines once included. */
  behaviors: BehaviorDef[];
  /** Compatibles of behaviors the keymap defines itself, e.g. `zmk,behavior-leader-key`. */
  compatibles?: string[];
  templates?: BehaviorTemplate[];
  shield?: ModuleShield;
  /** `.conf` settings the module needs, set when it's added. */
  kconfig?: Record<string, string>;
  /** Short setup notes shown on the card. */
  notes?: string;
}

const follows = (...versions: string[]) => Object.fromEntries(versions.map((v) => [v, v]));

const UROB = { name: 'urob', urlBase: 'https://github.com/urob' };
const STATUS_SCREEN = { CONFIG_ZMK_DISPLAY: 'y', CONFIG_ZMK_DISPLAY_STATUS_SCREEN_CUSTOM: 'y' };

export const MODULES: ModuleDef[] = [
  {
    id: 'zmk-unicode',
    name: 'Unicode',
    category: 'behaviors',
    description: 'Type any character, such as ä, ö and å, with &uc. Needs a Unicode input method on the computer.',
    homepage: 'https://github.com/urob/zmk-unicode',
    remote: UROB,
    revisions: follows('v0.3'),
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
    category: 'behaviors',
    description: 'Adds &num_word: a layer that stays on while you type numbers and turns off on any other key.',
    homepage: 'https://github.com/urob/zmk-auto-layer',
    remote: UROB,
    revisions: follows('v0.3', 'v0.2', 'v0.1'),
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
  {
    id: 'zmk-leader-key',
    name: 'Leader key',
    category: 'behaviors',
    description:
      'Press the leader key, then type a short sequence such as B O O T or U S B to run a behavior. Frees keys for rarely used actions.',
    homepage: 'https://github.com/urob/zmk-leader-key',
    remote: UROB,
    revisions: follows('v0.3', 'v0.2', 'v0.1'),
    includes: [],
    includePrefixes: [],
    behaviors: [],
    compatibles: ['zmk,behavior-leader-key'],
    templates: [
      {
        title: 'Leader key',
        source: `leader: leader {
    compatible = "zmk,behavior-leader-key";
    #binding-cells = <0>;
    usb { sequence = <U S B>; bindings = <&out OUT_USB>; };
    ble { sequence = <B L E>; bindings = <&out OUT_BLE>; };
    boot { sequence = <B O O T>; bindings = <&bootloader>; };
    reset { sequence = <R E S E T>; bindings = <&sys_reset>; };
};`,
      },
    ],
  },
  {
    id: 'zmk-adaptive-key',
    name: 'Adaptive keys',
    category: 'behaviors',
    description:
      'A key that sends something different depending on the key typed just before it, e.g. H after A sends U (Hands Down style adaptive keys), or dead keys for accents.',
    homepage: 'https://github.com/urob/zmk-adaptive-key',
    remote: UROB,
    revisions: follows('v0.3', 'v0.2', 'v0.1'),
    includes: [],
    includePrefixes: [],
    behaviors: [],
    compatibles: ['zmk,behavior-adaptive-key'],
    templates: [
      {
        title: 'Adaptive key',
        source: `ak_h: ak_h {
    compatible = "zmk,behavior-adaptive-key";
    #binding-cells = <0>;
    bindings = <&kp H>;
    akt_ah { trigger-keys = <A>; max-prior-idle-ms = <300>; bindings = <&kp U>; };
    akt_uh { trigger-keys = <U>; max-prior-idle-ms = <300>; bindings = <&kp A>; };
};`,
      },
    ],
  },
  {
    id: 'zmk-tri-state',
    name: 'Tri-state (swapper)',
    category: 'behaviors',
    description:
      'A key with start, continue and interrupt behaviors, such as an Alt-Tab window switcher that holds Alt until you press another key.',
    homepage: 'https://github.com/dhruvinsh/zmk-tri-state',
    remote: { name: 'dhruvinsh', urlBase: 'https://github.com/dhruvinsh' },
    // No release tags; its main branch builds with ZMK v0.1–v0.3 (Zephyr 3.5).
    revisions: { 'v0.3': 'main', 'v0.2': 'main', 'v0.1': 'main' },
    includes: [],
    includePrefixes: [],
    behaviors: [],
    compatibles: ['zmk,behavior-tri-state'],
    templates: [
      {
        title: 'Alt-Tab swapper',
        source: `swapper: swapper {
    compatible = "zmk,behavior-tri-state";
    #binding-cells = <0>;
    bindings = <&kt LALT>, <&kp TAB>, <&kt LALT>;
};`,
      },
    ],
    notes: 'Tip: add the position of a Shift-Tab key to “Keys that don’t interrupt” so you can go back through windows.',
  },
  {
    id: 'zmk-rgbled-widget',
    name: 'RGB LED battery & connection widget',
    category: 'lighting',
    description:
      'Blinks the built-in RGB LED of boards such as the Seeed XIAO BLE to show battery level and Bluetooth status. Adds &ind_bat, &ind_con and &ind_lyr keys to show them on demand.',
    homepage: 'https://github.com/caksoylar/zmk-rgbled-widget',
    remote: { name: 'caksoylar', urlBase: 'https://github.com/caksoylar' },
    revisions: follows('v0.3'),
    includes: ['behaviors/rgbled_widget.dtsi'],
    includePrefixes: ['behaviors/rgbled_widget.dtsi'],
    behaviors: [
      { ref: 'ind_bat', name: 'Show battery', description: 'Blinks the battery level on the RGB LED (zmk-rgbled-widget).', group: 'module', params: [] },
      { ref: 'ind_con', name: 'Show connection', description: 'Blinks the Bluetooth status on the RGB LED (zmk-rgbled-widget).', group: 'module', params: [] },
      { ref: 'ind_lyr', name: 'Show layer', description: 'Shows the active layer on the RGB LED (zmk-rgbled-widget).', group: 'module', params: [] },
    ],
    shield: {
      name: 'rgbled_adapter',
      help: 'Add it to builds on boards with an RGB LED: Seeed XIAO BLE or RP2040, nRF52840 M.2, nRF52840 MDK dongle.',
    },
  },
  {
    id: 'nice-view-gem',
    name: 'nice!view Gem',
    category: 'display',
    description: 'A sleek nice!view status screen: WPM gauge, battery, connection and an animated crystal on the right half.',
    homepage: 'https://github.com/M165437/nice-view-gem',
    remote: { name: 'm165437', urlBase: 'https://github.com/M165437' },
    revisions: { 'v0.3': 'v0.3.0' },
    includes: [],
    includePrefixes: [],
    behaviors: [],
    shield: { name: 'nice_view_gem', replaces: 'nice_view', help: 'Use it instead of nice_view on the builds with a nice!view.' },
    kconfig: STATUS_SCREEN,
  },
  {
    id: 'zmk-nice-oled',
    name: 'nice!oled widgets',
    category: 'display',
    description:
      'Vertical status widgets for 128×32 OLED screens (like the Lily58 and Corne ones): layer, battery, WPM, modifiers, Bongo Cat and Luna.',
    homepage: 'https://github.com/mctechnology17/zmk-nice-oled',
    remote: { name: 'mctechnology17', urlBase: 'https://github.com/mctechnology17' },
    revisions: { 'v0.3': 'v0.0.2' },
    includes: [],
    includePrefixes: [],
    behaviors: [],
    shield: { name: 'nice_oled', help: 'Add it to the builds of halves with an OLED screen.' },
    kconfig: STATUS_SCREEN,
    notes: 'Widgets are configured with CONFIG_NICE_OLED_* settings; see the module’s README.',
  },
  {
    id: 'zmk-helpers',
    name: 'ZMK helpers',
    category: 'helpers',
    description: 'Preprocessor helpers (ZMK_COMBO, ZMK_HOLD_TAP, key position labels…) for writing keymaps by hand.',
    homepage: 'https://github.com/urob/zmk-helpers',
    remote: UROB,
    revisions: follows('v0.3', 'v0.2', 'v0.1'),
    includes: ['zmk-helpers/helper.h'],
    includePrefixes: ['zmk-helpers/'],
    behaviors: [],
  },
];

export function findModule(id: string): ModuleDef | undefined {
  return MODULES.find((m) => m.id === id);
}

/** ZMK versions the module supports, newest first. */
export function supportedVersions(module: ModuleDef): string[] {
  return ZMK_VERSIONS.filter((v) => v in module.revisions);
}

/** The module's git ref for a ZMK version, if it supports it. */
export function moduleRevision(module: ModuleDef, zmkVersion: string): string | undefined {
  return module.revisions[zmkVersion];
}

/** Catalog modules whose headers the keymap includes. */
export function modulesIncludedBy(includePaths: string[]): ModuleDef[] {
  return MODULES.filter((m) => includePaths.some((path) => m.includePrefixes.some((prefix) => path.startsWith(prefix))));
}

/** The module whose behaviors have this compatible. */
export function moduleForCompatible(compatible: string): ModuleDef | undefined {
  return MODULES.find((m) => m.compatibles?.includes(compatible));
}

/** Names for behaviors that modules implement, shown as badges on the Behaviors tab. */
export const MODULE_BEHAVIOR_NAMES: Record<string, string> = {
  'zmk,behavior-leader-key': 'Leader key',
  'zmk,behavior-adaptive-key': 'Adaptive key',
  'zmk,behavior-tri-state': 'Tri-state',
};
