import type { ModuleDef } from './modules.ts';

/**
 * nice!view status screens, from whoop-t's nice-shield-collection
 * (https://github.com/whoop-t/nice-shield-collection). Each is a west module
 * with a shield that takes the place of `nice_view` in `build.yaml`.
 *
 * Every module is pinned to a commit checked against ZMK v0.3 (the
 * collection's repos don't follow ZMK main since its LVGL 9 update). Preview
 * images are downscaled copies of each repo's own (all MIT licensed) made by
 * scripts/gen-screen-previews.mjs; `source` is where each came from.
 */

export const COLLECTION_CREDIT = {
  name: 'whoop-t',
  profile: 'https://github.com/whoop-t',
  url: 'https://github.com/whoop-t/nice-shield-collection',
};

/** The stock ZMK screen every nice!view build has without a module. */
export const STOCK_SCREEN_SHIELD = 'nice_view';
export const NICE_VIEW_ADAPTER = 'nice_view_adapter';

export type ScreenOption =
  | { kind: 'bool'; symbol: string; label: string; default: boolean; help?: string }
  | { kind: 'int'; symbol: string; label: string; default: number; min?: number; max?: number; unit?: string; help?: string };

export interface ScreenPreview {
  /** File in public/screens/. */
  file: string;
  /** The original image in the screen's repo, at its pinned commit. */
  source: string;
  caption: string;
  /** Screen pixels rather than a photo: drawn without smoothing when enlarged. */
  pixelArt?: boolean;
}

export interface ScreenDef {
  id: string;
  name: string;
  /** The west module that provides the shield. */
  moduleId: string;
  shield: string;
  description: string;
  creator: { name: string; url: string };
  /** From the repo's LICENSE, e.g. "MIT, © 2024 Michael Schmidt-Voigt". */
  license: string;
  homepage: string;
  previews: ScreenPreview[];
  /** Where its art shows: some draw only on the peripheral half and look stock on the central one. */
  artOn: 'both' | 'peripheral' | 'central';
  options: ScreenOption[];
  /**
   * Screens in the same group can't share a keyboard (they define the same
   * shield or Kconfig names), though one of them can go on every half.
   */
  conflictGroup?: string;
}

const STATUS_SCREEN = { CONFIG_ZMK_DISPLAY: 'y', CONFIG_ZMK_DISPLAY_STATUS_SCREEN_CUSTOM: 'y' };

const INVERTED: ScreenOption = {
  kind: 'bool',
  symbol: 'CONFIG_NICE_VIEW_WIDGET_INVERTED',
  label: 'Invert colors',
  default: false,
  help: 'White on black. Shared by every nice!view screen on the keyboard.',
};

const animation = (symbol: string, defaultMs: number, frames?: number): ScreenOption[] => [
  { kind: 'bool', symbol, label: 'Animate', default: true, help: 'Off saves battery and shows one still frame.' },
  {
    kind: 'int',
    symbol: `${symbol}_MS`,
    label: 'Animation length',
    default: defaultMs,
    min: 100,
    unit: 'ms',
    help: frames ? `Time for all ${frames} frames; higher is slower.` : 'Time for one loop; higher is slower.',
  },
];

interface Repo {
  owner: string;
  repo: string;
  /** Git ref put in west.yml (a tag or a full commit hash). */
  revision: string;
  /** Commit hash of `revision`, for preview sources. */
  commit: string;
}

const REPOS = {
  gem: { owner: 'M165437', repo: 'nice-view-gem', revision: 'v0.3.0', commit: '7794ebf7f75d7e16cb05240bcffe6c5a45ef5b44' },
  battery: { owner: 'infely', repo: 'nice-view-battery', revision: 'a9ebccd6309e21525577dc35fea4eb107bda7cd1' },
  elemental: { owner: 'kevinpastor', repo: 'nice-view-elemental', revision: '69c2ecd56b0b870ddb94b79110ef5a2152ca4a3a' },
  pressStart: { owner: 'Ziembski', repo: 'nice-view-press-start', revision: '6892f92550d3eecd1d6c8b441f4c441b2e5ec1d4' },
  bongo: { owner: 'dsifry', repo: 'nice-view-mod', revision: '5f328cce749b2760cb61dcac30db29432685af69' },
  spacemarine: { owner: 'Jestar342', repo: 'nice-shield-spacemarine', revision: '974a78c6d778e4410a7243b8410d007eb2d23091' },
  onePunch: { owner: 'whoop-t', repo: 'nice-one-punch-ok', revision: '46294fc3646bffaa369db8066b7195f9ebe66520' },
  adventureTime: { owner: 'whoop-t', repo: 'nice-adventure-time', revision: '42f091646020f615230d1d8d5edca84b6267a9f8' },
  futuramaSus: { owner: 'whoop-t', repo: 'nice-futurama-sus', revision: 'a7483284912a8af90fdc02e4ea67317703684a5a' },
  fryButtonMiss: { owner: 'whoop-t', repo: 'nice-fry-button-miss', revision: 'cd7371d49c2b3f8eaa89b066ceaf8c07bb91cac1' },
  luffyWanted: { owner: 'whoop-t', repo: 'nice-luffy-wanted', revision: '5bff523975f87f01812d9df1045bc34a90dfd756' },
  luffyGearFive: { owner: 'whoop-t', repo: 'nice-luffy-gear-five', revision: '1d203a9b60d2b537f308186fe8dc247df6633b23' },
  hammerbeam: { owner: 'GPeye', repo: 'hammerbeam-slideshow', revision: '9c16436efa4c87d19e2e4558927969c7ddd5851d' },
  urchin: { owner: 'GPeye', repo: 'urchin-peripheral-animation', revision: '8b79464acfa8bb4c668e53049ad28b57889f2fe1' },
  mario: { owner: 'GPeye', repo: 'mario-peripheral-animation', revision: '1aa3950d6c86b4240b3f79d06bdbb04c5d920711' },
  niceOled: { owner: 'mctechnology17', repo: 'zmk-nice-oled', revision: 'v0.0.2', commit: 'dc2d10de6ee0f235e3ce39da8a7411c27a41b6b9' },
} satisfies Record<string, Omit<Repo, 'commit'> & { commit?: string }>;

type RepoKey = keyof typeof REPOS;

function repo(key: RepoKey): Repo {
  const r: Omit<Repo, 'commit'> & { commit?: string } = REPOS[key];
  return { ...r, commit: r.commit ?? r.revision };
}

const homepage = (key: RepoKey) => `https://github.com/${repo(key).owner}/${repo(key).repo}`;
const github = (user: string) => ({ name: user, url: `https://github.com/${user}` });

/** A preview made from `path` in the repo, saved as public/screens/`file`. */
function preview(key: RepoKey, path: string, file: string, caption: string, pixelArt = false): ScreenPreview {
  const r = repo(key);
  return { file, source: `https://raw.githubusercontent.com/${r.owner}/${r.repo}/${r.commit}/${path}`, caption, ...(pixelArt ? { pixelArt } : {}) };
}

export const SCREENS: ScreenDef[] = [
  {
    id: 'gem',
    name: 'nice!view Gem',
    moduleId: 'nice-view-gem',
    shield: 'nice_view_gem',
    description: 'A sleek status screen: WPM gauge and chart, battery, connection and layer, with an animated crystal on the peripheral half.',
    creator: github('M165437'),
    license: 'MIT, © 2024 Michael Schmidt-Voigt',
    homepage: homepage('gem'),
    previews: [preview('gem', '.github/assets/preview.jpg', 'gem.webp', 'Central (left) and peripheral (right)')],
    artOn: 'both',
    options: [
      { kind: 'bool', symbol: 'CONFIG_NICE_VIEW_GEM_WPM_FIXED_RANGE', label: 'Fixed WPM range', default: true, help: 'Off scales the gauge to your last 10 WPM readings, like the stock screen.' },
      { kind: 'int', symbol: 'CONFIG_NICE_VIEW_GEM_WPM_FIXED_RANGE_MAX', label: 'WPM range maximum', default: 100, min: 10, help: 'Set it to your goal speed.' },
      ...animation('CONFIG_NICE_VIEW_GEM_ANIMATION', 960, 16),
      INVERTED,
    ],
    conflictGroup: 'gem-module-name',
  },
  {
    id: 'battery',
    name: 'nice!view Battery',
    moduleId: 'nice-view-battery',
    shield: 'nice_view_battery',
    description: 'A big, clear battery gauge on both halves, with the connection and the layer on the central half.',
    creator: github('infely'),
    license: 'MIT, © 2024 Oleksandr Vasyliev',
    homepage: homepage('battery'),
    previews: [
      preview('battery', '.github/assets/preview.jpg', 'battery.webp', 'Battery and connection'),
      preview('battery', '.github/assets/layer.jpg', 'battery-layer.webp', 'Layer name'),
    ],
    artOn: 'both',
    options: [INVERTED],
  },
  {
    id: 'elemental',
    name: 'nice!view Elemental',
    moduleId: 'nice-view-elemental',
    shield: 'nice_view_elemental',
    description: 'The layer name in large outlined letters over an animated background, with small battery and connection icons.',
    creator: github('kevinpastor'),
    license: 'MIT, © 2024 Kevin Pastor',
    homepage: homepage('elemental'),
    previews: [
      preview('elemental', 'assets/animation.gif', 'elemental.webp', 'Animated background', true),
      preview('elemental', 'assets/preview_2.png', 'elemental-2.webp', 'Layer name', true),
    ],
    artOn: 'both',
    options: [
      { kind: 'bool', symbol: 'CONFIG_NICE_VIEW_ELEMENTAL_ANIMATION', label: 'Animate the background', default: true },
      { kind: 'int', symbol: 'CONFIG_NICE_VIEW_ELEMENTAL_ANIMATION_FRAME_MS', label: 'Frame delay', default: 250, min: 16, unit: 'ms' },
      { kind: 'bool', symbol: 'CONFIG_NICE_VIEW_ELEMENTAL_BACKGROUND', label: 'Show the background', default: true },
      { kind: 'bool', symbol: 'CONFIG_NICE_VIEW_ELEMENTAL_OUTLINE', label: 'Outline the layer name', default: true },
      { kind: 'bool', symbol: 'CONFIG_NICE_VIEW_ELEMENTAL_SHADOW', label: 'Shadow behind the layer name', default: true },
      { kind: 'bool', symbol: 'CONFIG_NICE_VIEW_ELEMENTAL_CAPITALIZATION', label: 'Capitalize the layer name', default: true },
    ],
  },
  {
    id: 'press-start',
    name: 'nice!view Press Start',
    moduleId: 'nice-view-press-start',
    shield: 'nice_view_press_start',
    description: 'Elemental with a retro game look: pixel font and animated game scenes behind the layer name.',
    creator: github('Ziembski'),
    license: 'MIT, © 2025 Ziembski',
    homepage: homepage('pressStart'),
    previews: [preview('pressStart', 'assets/Animations.gif', 'press-start.webp', 'Background animations')],
    artOn: 'both',
    options: [
      { kind: 'bool', symbol: 'CONFIG_NICE_VIEW_PRESS_START_ANIMATION', label: 'Animate the background', default: true },
      { kind: 'int', symbol: 'CONFIG_NICE_VIEW_PRESS_START_ANIMATION_FRAME_MS', label: 'Frame delay', default: 160, min: 16, unit: 'ms' },
      { kind: 'bool', symbol: 'CONFIG_NICE_VIEW_PRESS_START_BACKGROUND', label: 'Show the background', default: true },
      { kind: 'bool', symbol: 'CONFIG_NICE_VIEW_PRESS_START_OUTLINE', label: 'Outline the layer name', default: false },
      { kind: 'bool', symbol: 'CONFIG_NICE_VIEW_PRESS_START_SHADOW', label: 'Shadow behind the layer name', default: true },
      { kind: 'bool', symbol: 'CONFIG_NICE_VIEW_PRESS_START_CAPITALIZATION', label: 'Capitalize the layer name', default: true },
    ],
  },
  {
    id: 'bongo-cat',
    name: 'Bongo Cat with FURIOUS mode',
    moduleId: 'nice-view-mod',
    shield: 'nice_view_custom',
    description: 'Bongo Cat taps along as you type on the central half, and goes FURIOUS when you speed up. Sea creature art on the peripheral half.',
    creator: github('dsifry'),
    license: 'MIT, © 2024 GPeye',
    homepage: homepage('bongo'),
    previews: [preview('bongo', 'assets/seahorse.png', 'bongo-cat.webp', 'Peripheral art', true)],
    artOn: 'both',
    options: [
      { kind: 'bool', symbol: 'CONFIG_ZMK_WPM_GRAPH_ENABLED', label: 'WPM graph', default: true },
      INVERTED,
    ],
    conflictGroup: 'nice_view_custom',
  },
  {
    id: 'spacemarine',
    name: 'WH40K Space Marine insignia',
    moduleId: 'nice-shield-spacemarine',
    shield: 'nice_shield_spacemarine',
    description: 'Warhammer 40,000 Space Marine insignia art with battery and connection status.',
    creator: github('Jestar342'),
    license: 'MIT, © 2025 whoop-t',
    homepage: homepage('spacemarine'),
    // The repo has no pictures; these are drawn from its art's source.
    previews: [
      preview('spacemarine', 'boards/shields/nice_shield_spacemarine/assets/left_image.c', 'spacemarine.webp', 'Central half art', true),
      preview('spacemarine', 'boards/shields/nice_shield_spacemarine/assets/right_image.c', 'spacemarine-2.webp', 'Peripheral half art', true),
    ],
    artOn: 'both',
    options: [INVERTED],
    conflictGroup: 'shield-base',
  },
  {
    id: 'one-punch-ok',
    name: 'One Punch Man OK',
    moduleId: 'nice-one-punch-ok',
    shield: 'nice_one_punch_ok',
    description: 'Saitama giving an OK while rocks fly past on the central half.',
    creator: github('whoop-t'),
    license: 'MIT, © 2025 whoop-t',
    homepage: homepage('onePunch'),
    previews: [preview('onePunch', '.github/assets/onepunchok.gif', 'one-punch-ok.webp', 'On a keyboard')],
    artOn: 'both',
    options: [...animation('CONFIG_NICE_LEFT_ANIMATION', 960, 5), INVERTED],
    conflictGroup: 'shield-base',
  },
  {
    id: 'adventure-time',
    name: 'Adventure Time',
    moduleId: 'nice-adventure-time',
    shield: 'nice_adventure_time',
    description: 'Finn and Jake from Adventure Time, with battery, connection and layer.',
    creator: github('whoop-t'),
    license: 'MIT, © 2024 Michael Schmidt-Voigt',
    homepage: homepage('adventureTime'),
    previews: [preview('adventureTime', '.github/assets/fj.jpg', 'adventure-time.webp', 'On a keyboard')],
    artOn: 'both',
    options: [...animation('CONFIG_NICE_VIEW_GEM_ANIMATION', 960), INVERTED],
    conflictGroup: 'gem-module-name',
  },
  {
    id: 'futurama-sus',
    name: 'Futurama: Fry squint',
    moduleId: 'nice-futurama-sus',
    shield: 'nice_futurama_sus',
    description: 'Fry’s suspicious squint from Futurama, slowly narrowing.',
    creator: github('whoop-t'),
    license: 'MIT, © 2024 Michael Schmidt-Voigt',
    homepage: homepage('futuramaSus'),
    previews: [preview('futuramaSus', '.github/assets/futuramasus.gif', 'futurama-sus.webp', 'On a keyboard')],
    artOn: 'both',
    options: [...animation('CONFIG_NICE_FUTURAMA_SUS_ANIMATION', 2400, 16), INVERTED],
  },
  {
    id: 'fry-button-miss',
    name: 'Futurama: Fry misses the button',
    moduleId: 'nice-fry-button-miss',
    shield: 'nice_fry_button_miss',
    description: 'Fry reaching for a button and missing it, on the peripheral half.',
    creator: github('whoop-t'),
    license: 'MIT, © 2025 whoop-t',
    homepage: homepage('fryButtonMiss'),
    previews: [preview('fryButtonMiss', '.github/assets/frybuttonmiss.gif', 'fry-button-miss.webp', 'On a keyboard')],
    artOn: 'both',
    options: [...animation('CONFIG_NICE_RIGHT_ANIMATION', 1440, 16), INVERTED],
    conflictGroup: 'shield-base',
  },
  {
    id: 'luffy-wanted',
    name: 'One Piece: Luffy wanted poster',
    moduleId: 'nice-luffy-wanted',
    shield: 'nice_luffy_wanted',
    description: 'Luffy’s wanted poster from One Piece.',
    creator: github('whoop-t'),
    license: 'MIT, © 2025 whoop-t',
    homepage: homepage('luffyWanted'),
    previews: [preview('luffyWanted', '.github/assets/luffywanted.jpg', 'luffy-wanted.webp', 'On a keyboard')],
    artOn: 'both',
    options: [INVERTED],
    conflictGroup: 'shield-base',
  },
  {
    id: 'luffy-gear-five',
    name: 'One Piece: Luffy Gear Five',
    moduleId: 'nice-luffy-gear-five',
    shield: 'nice_luffy_gear_five',
    description: 'Luffy in Gear Five from One Piece.',
    creator: github('whoop-t'),
    license: 'MIT, © 2025 whoop-t',
    homepage: homepage('luffyGearFive'),
    previews: [preview('luffyGearFive', '.github/assets/gearfive.jpg', 'luffy-gear-five.webp', 'On a keyboard')],
    artOn: 'both',
    options: [INVERTED],
    conflictGroup: 'shield-base',
  },
  {
    id: 'hammerbeam-slideshow',
    name: 'Hammerbeam slideshow',
    moduleId: 'hammerbeam-slideshow',
    shield: 'nice_view_custom',
    description: 'A slow slideshow of Hammerbeam art on the peripheral half; the central half keeps the stock status.',
    creator: github('GPeye'),
    license: 'MIT, © 2024 GPeye',
    homepage: homepage('hammerbeam'),
    previews: [
      preview('hammerbeam', 'assets/hammerbeam.png', 'hammerbeam.webp', 'Slideshow art', true),
      preview('hammerbeam', 'assets/20240913_193934.png', 'hammerbeam-2.webp', 'On a keyboard'),
    ],
    artOn: 'peripheral',
    options: [
      { kind: 'int', symbol: 'CONFIG_CUSTOM_ANIMATION_SPEED', label: 'Slideshow length', default: 300000, min: 1000, unit: 'ms', help: 'Time for all slides; the default shows each for 10 seconds.' },
      INVERTED,
    ],
    conflictGroup: 'nice_view_custom',
  },
  {
    id: 'urchin-animation',
    name: 'Urchin corro animation',
    moduleId: 'urchin-peripheral-animation',
    shield: 'nice_view_custom',
    description: 'The cute corro from the Urchin keyboard, animated on the peripheral half; the central half keeps the stock status.',
    creator: github('GPeye'),
    license: 'MIT, © 2024 GPeye',
    homepage: homepage('urchin'),
    previews: [preview('urchin', 'assets/Sprite.gif', 'urchin.webp', 'The animation', true)],
    artOn: 'peripheral',
    options: [
      { kind: 'int', symbol: 'CONFIG_CUSTOM_ANIMATION_SPEED', label: 'Animation length', default: 9600, min: 500, unit: 'ms', help: 'Time for all 12 frames.' },
      INVERTED,
    ],
    conflictGroup: 'nice_view_custom',
  },
  {
    id: 'mario-animation',
    name: 'Mario animation',
    moduleId: 'mario-peripheral-animation',
    shield: 'nice_view_custom',
    description: 'Mario running on the peripheral half; the central half keeps the stock status.',
    creator: github('GPeye'),
    license: 'MIT, © 2024 GPeye',
    homepage: homepage('mario'),
    previews: [preview('mario', 'mario.gif', 'mario.webp', 'The animation', true)],
    artOn: 'peripheral',
    options: [INVERTED],
    conflictGroup: 'nice_view_custom',
  },
  {
    id: 'nice-epaper',
    name: 'nice!epaper',
    moduleId: 'zmk-nice-oled',
    shield: 'nice_epaper',
    description: 'The nice!oled widgets drawn for the nice!view: layer, battery, WPM with Bongo Cat, and an animation on the peripheral half.',
    creator: github('mctechnology17'),
    license: 'MIT, © 2024 Marcos Chow Castro',
    homepage: homepage('niceOled'),
    previews: [preview('niceOled', 'assets/nice_epaper_demo.GIF', 'nice-epaper.webp', 'On a Corne')],
    artOn: 'both',
    options: [
      { kind: 'bool', symbol: 'CONFIG_NICE_OLED_WIDGET_INVERTED', label: 'Invert colors', default: false },
      { kind: 'bool', symbol: 'CONFIG_NICE_OLED_WIDGET_OUTPUT_BACKGROUND', label: 'Background behind the connection', default: true },
      { kind: 'bool', symbol: 'CONFIG_NICE_OLED_WIDGET_WPM_BONGO_CAT', label: 'Bongo Cat on the central half', default: true },
      { kind: 'bool', symbol: 'CONFIG_NICE_OLED_WIDGET_ANIMATION_PERIPHERAL', label: 'Animation on the peripheral half', default: true },
      { kind: 'bool', symbol: 'CONFIG_NICE_OLED_SHOW_SLEEP_ART_ON_IDLE', label: 'Sleep art when idle', default: false },
    ],
  },
];

/** West modules for the screens (nice!epaper's is the nice!oled module, listed with the other modules). */
export const SCREEN_MODULES: ModuleDef[] = SCREENS.filter((s) => s.moduleId !== 'zmk-nice-oled').map((s) => {
  const key = (Object.keys(REPOS) as RepoKey[]).find((k) => REPOS[k].repo === s.moduleId);
  if (!key) throw new Error(`No repo for ${s.moduleId}`);
  const r = repo(key);
  return {
    id: s.moduleId,
    name: s.name,
    category: 'display',
    description: s.description,
    homepage: s.homepage,
    remote: { name: r.owner.toLowerCase(), urlBase: `https://github.com/${r.owner}` },
    revisions: { 'v0.3': r.revision },
    includes: [],
    includePrefixes: [],
    behaviors: [],
    kconfig: STATUS_SCREEN,
  };
});

export function findScreen(id: string): ScreenDef | undefined {
  return SCREENS.find((s) => s.id === id);
}

/** Every shield that draws a nice!view screen: the stock one and the catalog's. */
export const SCREEN_SHIELDS: string[] = [STOCK_SCREEN_SHIELD, ...new Set(SCREENS.map((s) => s.shield))];

/** Whether a west module exists only to provide screens (so the Screens tab manages it). */
export function isScreenModule(moduleId: string): boolean {
  return SCREEN_MODULES.some((m) => m.id === moduleId);
}
