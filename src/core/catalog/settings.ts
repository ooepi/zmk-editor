import type { ZmkConfig } from '../config.ts';
import { SCREEN_SHIELDS } from './screens.ts';
import { readKconfigValue, writeKconfigValue, type KconfigModel } from '../files/kconfig.ts';
import { hasDisplay } from '../hardware/displays.ts';
import { sensorOrder } from '../hardware/encoders.ts';
import type { Binding } from '../keymap/model.ts';

export type SettingType =
  | { kind: 'bool' }
  | { kind: 'int'; unit?: 'ms' | 's' | '%' | '°'; min?: number; max?: number }
  | { kind: 'string'; maxLength?: number }
  /** A Kconfig choice: exactly one option is set to `y`. */
  | { kind: 'choice'; options: { name: string; label: string }[] };

export type SettingValue = boolean | number | string;

export interface SettingDef {
  /** Kconfig symbol without `CONFIG_`; for a choice, an id for the group of options. */
  name: string;
  label: string;
  help: string;
  group: SettingGroup;
  type: SettingType;
  /** ZMK v0.3's default; absent when the board or shield decides. */
  default?: SettingValue;
  /** Rarely changed: listed after a group's everyday settings, behind "Show advanced". */
  advanced?: true;
}

export type SettingGroup = 'power' | 'bluetooth' | 'battery' | 'underglow' | 'backlight' | 'display' | 'input' | 'keyboard';

export const SETTING_GROUPS: { id: SettingGroup; label: string; description: string }[] = [
  { id: 'power', label: 'Power & sleep', description: 'When the keyboard idles and sleeps to save battery.' },
  { id: 'bluetooth', label: 'Bluetooth', description: 'Signal strength, profiles and pairing.' },
  { id: 'battery', label: 'Battery & split', description: 'Battery reporting, including the other half of a split keyboard.' },
  { id: 'underglow', label: 'RGB underglow', description: 'LED strip under the keyboard. Keys use &rgb_ug.' },
  { id: 'backlight', label: 'Backlight', description: 'Single-colour key backlight. Keys use &bl.' },
  { id: 'display', label: 'Display', description: 'OLED or nice!view screen and its widgets.' },
  { id: 'input', label: 'Encoders & pointing', description: 'Rotary encoders and mouse keys.' },
  { id: 'keyboard', label: 'Keyboard & USB', description: 'Name, key roll-over and debugging.' },
];

const bool = (name: string, group: SettingGroup, label: string, help: string, def?: boolean): SettingDef =>
  def === undefined ? { name, group, label, help, type: { kind: 'bool' } } : { name, group, label, help, type: { kind: 'bool' }, default: def };
const int = (name: string, group: SettingGroup, label: string, help: string, def: number, type: Omit<Extract<SettingType, { kind: 'int' }>, 'kind'> = {}): SettingDef => ({
  name,
  group,
  label,
  help,
  type: { kind: 'int', ...type },
  default: def,
});
const pct = { unit: '%', min: 0, max: 100 } as const;

/** Rarely changed settings, shown after each group's everyday ones. */
const ADVANCED = new Set([
  'BT_CTLR_TX_PWR',
  'BT_MAX_CONN',
  'ZMK_BLE_EXPERIMENTAL_CONN',
  'ZMK_BLE_EXPERIMENTAL_SEC',
  'ZMK_BLE_PASSKEY_ENTRY',
  'BT_GATT_ENFORCE_SUBSCRIPTION',
  'ZMK_BLE_CLEAR_BONDS_ON_START',
  'ZMK_RGB_UNDERGLOW_EXT_POWER',
  'ZMK_RGB_UNDERGLOW_BRT_MIN',
  'ZMK_RGB_UNDERGLOW_HUE_STEP',
  'ZMK_RGB_UNDERGLOW_SAT_STEP',
  'ZMK_RGB_UNDERGLOW_BRT_STEP',
  'EC11_TRIGGER',
  'ZMK_POINTING_SMOOTH_SCROLLING',
  'ZMK_HID_REPORT_TYPE',
  'ZMK_HID_CONSUMER_REPORT_USAGES',
  'ZMK_USB_LOGGING',
]);

/** Curated from ZMK v0.3's configuration docs (docs/docs/config/*.md). */
export const SETTINGS: SettingDef[] = (
  [
  int('ZMK_IDLE_TIMEOUT', 'power', 'Idle after', 'Inactivity before the keyboard idles (lighting and display can turn off).', 30000, { unit: 'ms', min: 0 }),
  bool('ZMK_SLEEP', 'power', 'Deep sleep', 'Sleep after a longer inactivity. Wakes on a key press; the connection may take a moment to return.', false),
  int('ZMK_IDLE_SLEEP_TIMEOUT', 'power', 'Deep sleep after', 'Inactivity before deep sleep (when deep sleep is on).', 900000, { unit: 'ms', min: 0 }),
  bool('ZMK_PM_SOFT_OFF', 'power', 'Soft off', 'Allow turning the keyboard off from the keymap (&soft_off) or a dedicated button.', false),
  bool('ZMK_EXT_POWER', 'power', 'External power control', 'Lets &ext_power switch power to displays and LEDs.', true),

  {
    name: 'BT_CTLR_TX_PWR',
    group: 'bluetooth',
    label: 'Transmit power',
    help: 'Stronger signal helps range and split connections, at some battery cost.',
    type: {
      kind: 'choice',
      options: [
        { name: 'BT_CTLR_TX_PWR_PLUS_8', label: '+8 dBm (strongest)' },
        { name: 'BT_CTLR_TX_PWR_PLUS_4', label: '+4 dBm' },
        { name: 'BT_CTLR_TX_PWR_0', label: '0 dBm' },
        { name: 'BT_CTLR_TX_PWR_MINUS_4', label: '−4 dBm' },
        { name: 'BT_CTLR_TX_PWR_MINUS_8', label: '−8 dBm' },
      ],
    },
    default: 'BT_CTLR_TX_PWR_0',
  },
  int('BT_MAX_CONN', 'bluetooth', 'Simultaneous connections', 'Usually the same as the number of profiles.', 5, { min: 1, max: 20 }),
  int('BT_MAX_PAIRED', 'bluetooth', 'Profiles (paired devices)', 'How many hosts can be paired (&bt BT_SEL 0 … n−1).', 5, { min: 1, max: 20 }),
  bool('ZMK_BLE_EXPERIMENTAL_CONN', 'bluetooth', 'Experimental connection stability', 'Settings planned to become default; disables 2M PHY. Try it if connections drop.', false),
  bool('ZMK_BLE_EXPERIMENTAL_SEC', 'bluetooth', 'Experimental security', 'Passkey entry and overwriting keys of previously paired hosts.', false),
  bool('ZMK_BLE_PASSKEY_ENTRY', 'bluetooth', 'Passkey when pairing', 'Type a passkey from the host to pair. Re-pair every host after changing this.', false),
  bool('BT_GATT_ENFORCE_SUBSCRIPTION', 'bluetooth', 'Enforce GATT subscription', 'Turn off to work around a Windows bug with battery notifications.', true),
  bool('ZMK_BLE_CLEAR_BONDS_ON_START', 'bluetooth', 'Clear pairings on start', 'Forgets all paired hosts every start. Only for fixing pairing problems; turn it off again afterwards.', false),

  bool('ZMK_BATTERY_REPORTING', 'battery', 'Battery reporting', 'Report battery level to hosts. Most boards turn this on.'),
  int('ZMK_BATTERY_REPORT_INTERVAL', 'battery', 'Report interval', 'Seconds between battery level reports.', 60, { unit: 's', min: 1 }),
  bool('ZMK_SPLIT_BLE_CENTRAL_BATTERY_LEVEL_FETCHING', 'battery', 'Fetch the other half’s battery', 'The central half reads the peripheral half’s battery level (shown on displays).', false),
  bool('ZMK_SPLIT_BLE_CENTRAL_BATTERY_LEVEL_PROXY', 'battery', 'Report both halves to the host', 'Hosts see a battery level for each half.', false),

  bool('ZMK_RGB_UNDERGLOW', 'underglow', 'RGB underglow', 'Enable the LED strip.', false),
  bool('ZMK_RGB_UNDERGLOW_ON_START', 'underglow', 'On at start', 'Lights are on when the keyboard starts.', true),
  bool('ZMK_RGB_UNDERGLOW_AUTO_OFF_IDLE', 'underglow', 'Off when idle', 'Turn lights off when the keyboard idles (saves battery).', false),
  bool('ZMK_RGB_UNDERGLOW_AUTO_OFF_USB', 'underglow', 'Off without USB', 'Turn lights off when USB is unplugged.', false),
  bool('ZMK_RGB_UNDERGLOW_EXT_POWER', 'underglow', 'Controls external power', 'Toggling underglow also switches external power.', true),
  int('ZMK_RGB_UNDERGLOW_HUE_START', 'underglow', 'Start hue', 'Colour at start, in degrees (0 red, 120 green, 240 blue).', 0, { unit: '°', min: 0, max: 359 }),
  int('ZMK_RGB_UNDERGLOW_SAT_START', 'underglow', 'Start saturation', '', 100, pct),
  int('ZMK_RGB_UNDERGLOW_BRT_START', 'underglow', 'Start brightness', '', 100, pct),
  int('ZMK_RGB_UNDERGLOW_EFF_START', 'underglow', 'Start effect', '0 solid, 1 breathe, 2 spectrum, 3 swirl.', 0, { min: 0, max: 3 }),
  int('ZMK_RGB_UNDERGLOW_SPD_START', 'underglow', 'Start effect speed', '1 (slow) to 5 (fast).', 3, { min: 1, max: 5 }),
  int('ZMK_RGB_UNDERGLOW_BRT_MIN', 'underglow', 'Minimum brightness', '', 0, pct),
  int('ZMK_RGB_UNDERGLOW_BRT_MAX', 'underglow', 'Maximum brightness', 'Lower it to save battery.', 100, pct),
  int('ZMK_RGB_UNDERGLOW_HUE_STEP', 'underglow', 'Hue step', 'Change per &rgb_ug RGB_HUI/RGB_HUD press.', 10, { unit: '°', min: 1, max: 359 }),
  int('ZMK_RGB_UNDERGLOW_SAT_STEP', 'underglow', 'Saturation step', '', 10, pct),
  int('ZMK_RGB_UNDERGLOW_BRT_STEP', 'underglow', 'Brightness step', '', 10, pct),

  bool('ZMK_BACKLIGHT', 'backlight', 'Backlight', 'Enable the key backlight.', false),
  bool('ZMK_BACKLIGHT_ON_START', 'backlight', 'On at start', '', true),
  int('ZMK_BACKLIGHT_BRT_START', 'backlight', 'Start brightness', '', 40, pct),
  int('ZMK_BACKLIGHT_BRT_STEP', 'backlight', 'Brightness step', 'Change per &bl BL_INC/BL_DEC press.', 20, pct),
  bool('ZMK_BACKLIGHT_AUTO_OFF_IDLE', 'backlight', 'Off when idle', '', false),
  bool('ZMK_BACKLIGHT_AUTO_OFF_USB', 'backlight', 'Off without USB', '', false),

  bool('ZMK_DISPLAY', 'display', 'Display', 'Enable the screen.', false),
  bool('ZMK_DISPLAY_BLANK_ON_IDLE', 'display', 'Blank when idle', 'Turn the screen off when the keyboard idles.'),
  bool('ZMK_DISPLAY_INVERT', 'display', 'Invert colours', '', false),
  bool('ZMK_WIDGET_LAYER_STATUS', 'display', 'Layer widget', 'Show the active layer.', true),
  bool('ZMK_WIDGET_BATTERY_STATUS', 'display', 'Battery widget', '', true),
  bool('ZMK_WIDGET_BATTERY_STATUS_SHOW_PERCENTAGE', 'display', 'Battery as percentage', 'Numbers instead of icons.', false),
  bool('ZMK_WIDGET_OUTPUT_STATUS', 'display', 'Output widget', 'Show USB or Bluetooth profile.', true),
  bool('ZMK_WIDGET_WPM_STATUS', 'display', 'Words-per-minute widget', '', false),

  bool('EC11', 'input', 'Rotary encoders (EC11)', 'Needed for encoders on most keyboards.', false),
  {
    name: 'EC11_TRIGGER',
    group: 'input',
    label: 'Encoder processing',
    help: 'Encoders need one of these; “global thread” is the usual choice.',
    type: {
      kind: 'choice',
      options: [
        { name: 'EC11_TRIGGER_GLOBAL_THREAD', label: 'Global thread' },
        { name: 'EC11_TRIGGER_OWN_THREAD', label: 'Own thread' },
        { name: 'EC11_TRIGGER_NONE', label: 'None (encoders off)' },
      ],
    },
  },
  bool('ZMK_POINTING', 'input', 'Mouse keys', 'Needed for &mkp, &mmv and &msc.', false),
  bool('ZMK_POINTING_SMOOTH_SCROLLING', 'input', 'Smooth scrolling', 'High-resolution scrolling where the host supports it.', false),

  { name: 'ZMK_KEYBOARD_NAME', group: 'keyboard', label: 'Keyboard name', help: 'Name shown when pairing (max 16 characters). Empty: the shield’s name.', type: { kind: 'string', maxLength: 16 } },
  {
    name: 'ZMK_HID_REPORT_TYPE',
    group: 'keyboard',
    label: 'Key roll-over',
    help: 'NKRO registers any number of keys at once but may not work in some BIOS/UEFI setups.',
    type: {
      kind: 'choice',
      options: [
        { name: 'ZMK_HID_REPORT_TYPE_HKRO', label: '6-key roll-over (most compatible)' },
        { name: 'ZMK_HID_REPORT_TYPE_NKRO', label: 'N-key roll-over' },
      ],
    },
    default: 'ZMK_HID_REPORT_TYPE_HKRO',
  },
  {
    name: 'ZMK_HID_CONSUMER_REPORT_USAGES',
    group: 'keyboard',
    label: 'Media keys',
    help: 'Basic works with more operating systems; full enables every consumer key code.',
    type: {
      kind: 'choice',
      options: [
        { name: 'ZMK_HID_CONSUMER_REPORT_USAGES_BASIC', label: 'Basic (most compatible)' },
        { name: 'ZMK_HID_CONSUMER_REPORT_USAGES_FULL', label: 'Full' },
      ],
    },
  },
  bool('ZMK_WPM', 'keyboard', 'Words per minute', 'Calculate typing speed (used by WPM widgets).', false),
  bool('ZMK_USB_LOGGING', 'keyboard', 'USB logging', 'Debug output over USB. Uses more power; turn off for daily use.', false),
  ] satisfies SettingDef[]
).map((def): SettingDef => (ADVANCED.has(def.name) ? { ...def, advanced: true } : def));

export function findSetting(name: string): SettingDef | undefined {
  return SETTINGS.find((s) => s.name === name);
}

const unquote = (value: string) => {
  const m = /^"((?:[^"\\]|\\.)*)"$/.exec(value);
  return m?.[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : value;
};
const quote = (value: string) => `"${value.replace(/[\\"]/g, (c) => `\\${c}`)}"`;

/** The value set in the `.conf`, or undefined when the default applies. */
export function readSetting(model: KconfigModel, def: SettingDef): SettingValue | undefined {
  const { type } = def;
  if (type.kind === 'choice') return type.options.find((o) => readKconfigValue(model, `CONFIG_${o.name}`) === 'y')?.name;
  const raw = readKconfigValue(model, `CONFIG_${def.name}`);
  if (raw === undefined) return undefined;
  switch (type.kind) {
    case 'bool':
      return raw === 'y' ? true : raw === 'n' ? false : undefined;
    case 'int': {
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'string':
      return unquote(raw);
  }
}

/** Writes a value; `undefined` removes the line so ZMK's (or the board's) default applies. */
export function writeSetting(model: KconfigModel, def: SettingDef, value: SettingValue | undefined): KconfigModel {
  const { type } = def;
  if (type.kind === 'choice') {
    let next = model;
    for (const option of type.options) {
      next = writeKconfigValue(next, `CONFIG_${option.name}`, option.name === value ? 'y' : undefined);
    }
    return next;
  }
  const encoded =
    value === undefined ? undefined : type.kind === 'bool' ? (value ? 'y' : 'n') : type.kind === 'string' ? quote(String(value)) : String(value);
  return writeKconfigValue(model, `CONFIG_${def.name}`, encoded);
}

export interface SettingWarning {
  message: string;
  /** The setting it's about, to point at its group. */
  setting: string;
  fix?: { name: string; value: SettingValue };
}

function usedBehaviors(config: ZmkConfig): { keys: Set<string>; sensors: boolean } {
  const keys = new Set<string>();
  const add = (b: Binding) => keys.add(b.behavior);
  let sensors = false;
  for (const layer of config.keymap.layers) {
    layer.bindings.forEach(add);
    for (const b of layer.sensorBindings ?? []) {
      if (b.behavior !== 'trans' && b.behavior !== 'none') sensors = true;
    }
  }
  config.keymap.combos.forEach((c) => add(c.binding));
  config.keymap.behaviors.forEach((b) => b.bindings.forEach(add));
  return { keys, sensors };
}

/**
 * Settings that need hardware a keyboard designed in the editor doesn't have
 * yet (its shield defines keys only). ZMK builds these features against
 * devicetree nodes, so turning one on fails the build. Catalog keyboards'
 * shields bring their own hardware and are never flagged.
 */
const HARDWARE_FEATURES: { name: string; label: string; part: string }[] = [
  { name: 'ZMK_DISPLAY', label: 'Display', part: 'screen' },
  { name: 'ZMK_RGB_UNDERGLOW', label: 'RGB underglow', part: 'LED strip' },
  { name: 'ZMK_BACKLIGHT', label: 'Backlight', part: 'backlight LEDs' },
  { name: 'EC11', label: 'Rotary encoders (EC11)', part: 'encoders' },
];

/** Shields that add a screen to any Pro Micro keyboard, so the display setting is fine with them. */
const DISPLAY_SHIELDS = [...SCREEN_SHIELDS, 'nice_oled'];

export interface UnsupportedSetting {
  name: string;
  message: string;
}

/** Hardware settings turned on for a designed keyboard that has no such hardware. */
export function unsupportedHardwareSettings(config: ZmkConfig): UnsupportedSetting[] {
  const hw = config.hardware;
  if (!hw) return [];
  return HARDWARE_FEATURES.flatMap(({ name, label, part }) => {
    const def = findSetting(name);
    if (!def || readSetting(config.kconfig, def) !== true || !lacksHardwareFor(config, name)) return [];
    return [{ name, message: `${label} is on, but ${hw.displayName} has no ${part} yet, so the firmware won’t build.` }];
  });
}

/** Whether a setting needs hardware this designed keyboard doesn't have (always false for catalog keyboards). */
export function lacksHardwareFor(config: ZmkConfig, name: string): boolean {
  if (!config.hardware || !HARDWARE_FEATURES.some((f) => f.name === name)) return false;
  if (name === 'EC11') return sensorOrder(config.hardware).length === 0;
  return name !== 'ZMK_DISPLAY' || !(hasDisplayShield(config) || hasDisplay(config.hardware));
}

function hasDisplayShield(config: ZmkConfig): boolean {
  return config.build.include.some((t) => (t.shield ?? '').split(/\s+/).some((s) => DISPLAY_SHIELDS.includes(s)));
}

/** Settings that don't fit the keymap, each with a one-click fix where there is one. */
export function settingWarnings(config: ZmkConfig): SettingWarning[] {
  const value = (name: string) => {
    const def = findSetting(name);
    if (!def) return undefined;
    const set = readSetting(config.kconfig, def);
    if (set === undefined && name === 'EC11' && config.hardware && sensorOrder(config.hardware).length > 0) return true;
    if (set === undefined && name === 'ZMK_DISPLAY' && config.hardware && hasDisplay(config.hardware)) return true;
    return set ?? def.default;
  };
  const { keys, sensors } = usedBehaviors(config);
  /** A warning about `name` whose fix sets it to `to`. */
  const fixing = (name: string, to: SettingValue, message: string): SettingWarning => ({ message, setting: name, fix: { name, value: to } });
  const warnings: SettingWarning[] = unsupportedHardwareSettings(config).map(({ name, message }) => fixing(name, false, message));
  // Don't suggest turning on something the keyboard has no hardware for.
  const canUse = (name: string) => !lacksHardwareFor(config, name);
  if (['mkp', 'mmv', 'msc'].some((b) => keys.has(b)) && value('ZMK_POINTING') !== true) {
    warnings.push(fixing('ZMK_POINTING', true, 'The keymap has mouse keys, but mouse keys are off, so they won’t work.'));
  }
  if (keys.has('rgb_ug') && value('ZMK_RGB_UNDERGLOW') !== true && canUse('ZMK_RGB_UNDERGLOW')) {
    warnings.push(fixing('ZMK_RGB_UNDERGLOW', true, 'The keymap has &rgb_ug keys, but RGB underglow is off.'));
  }
  if (keys.has('bl') && value('ZMK_BACKLIGHT') !== true && canUse('ZMK_BACKLIGHT')) {
    warnings.push(fixing('ZMK_BACKLIGHT', true, 'The keymap has &bl keys, but the backlight is off.'));
  }
  if (sensors && value('EC11') !== true && canUse('EC11')) {
    warnings.push(fixing('EC11', true, 'The keymap uses an encoder, but EC11 encoder support isn’t turned on here (most keyboards need it).'));
  }
  if (config.hardware && hasDisplay(config.hardware) && value('ZMK_DISPLAY') === false) {
    warnings.push(fixing('ZMK_DISPLAY', true, `${config.hardware.displayName} has a screen, but Display is off in Settings, so it stays dark.`));
  }
  const idle = value('ZMK_IDLE_TIMEOUT');
  const sleep = value('ZMK_IDLE_SLEEP_TIMEOUT');
  if (value('ZMK_SLEEP') === true && typeof idle === 'number' && typeof sleep === 'number' && sleep < idle) {
    warnings.push({
      message: 'Deep sleep starts before the keyboard goes idle; the sleep time should be longer than the idle time.',
      setting: 'ZMK_IDLE_SLEEP_TIMEOUT',
    });
  }
  return warnings;
}
