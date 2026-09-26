import type { ZmkConfig } from '../config.ts';
import type { BuildTarget } from '../files/build.ts';
import { parseKconfig } from '../files/kconfig.ts';
import { importKeymap } from '../keymap/importer.ts';
import type { PhysicalLayout } from '../layouts/types.ts';
import { CONTROLLER_DATA, KEYBOARD_DATA, type ControllerData, type KeyboardData } from './keyboards.data.ts';

export interface KeyboardDef extends Omit<KeyboardData, 'layouts'> {
  layouts: PhysicalLayout[];
  /** Name of the keymap/conf files in a zmk-config repo (e.g. `corne`). */
  configName: string;
  split: boolean;
}

export type Controller = ControllerData;

export const KEYBOARDS: KeyboardDef[] = KEYBOARD_DATA.map((data) => ({
  ...data,
  layouts: data.layouts.map((layout) => ({
    name: layout.name,
    keys: layout.keys.map(([x, y, w, h, r, rx, ry]) => ({ x, y, w, h, r, rx, ry })),
  })),
  configName: data.keymapPath ? (data.keymapPath.split('/').at(-1) ?? '').replace(/\.keymap$/, '') : data.id,
  split: data.siblings.length > 1,
}));

/** A keyboard by id, one of its halves (`corne_left`), or its config name (`corneish_zen`). */
export function findKeyboard(name: string): KeyboardDef | undefined {
  const exact = KEYBOARDS.find((k) => k.id === name || k.siblings.includes(name));
  if (exact) return exact;
  return KEYBOARDS.filter((k) => k.configName === name).at(-1);
}

export function layoutsFor(keyboard: KeyboardDef, keyCount: number): PhysicalLayout[] {
  return keyboard.layouts.filter((l) => l.keys.length === keyCount);
}

/** Controllers that fit the keyboard; none for keyboards that are boards themselves. */
export function controllersFor(keyboard: KeyboardDef): Controller[] {
  if (keyboard.kind === 'board') return [];
  const needs = keyboard.requires.length > 0 ? keyboard.requires : ['pro_micro'];
  return CONTROLLER_DATA.filter((c) => needs.some((n) => c.exposes.includes(n)));
}

/** A nice!view needs the adapter, which fits pro micro footprint keyboards. */
export function supportsNiceView(keyboard: KeyboardDef): boolean {
  return keyboard.kind === 'shield' && keyboard.requires.includes('pro_micro');
}

export function buildTargets(keyboard: KeyboardDef, controller: string, options: { niceView?: boolean } = {}): BuildTarget[] {
  const parts = keyboard.siblings.length > 0 ? keyboard.siblings : [keyboard.id];
  if (keyboard.kind === 'board') return parts.map((board) => ({ board }));
  const extras = options.niceView && supportsNiceView(keyboard) ? ' nice_view_adapter nice_view' : '';
  return parts.map((shield) => ({ board: controller, shield: `${shield}${extras}` }));
}

export interface NewConfigOptions {
  controller: string;
  niceView: boolean;
  zmkVersion: string;
}

type FetchText = (url: string) => Promise<string>;

const defaultFetchText: FetchText = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't download ${url} (${response.status}).`);
  return response.text();
};

/**
 * A fresh config for a catalog keyboard, starting from ZMK's own default
 * keymap and .conf for the chosen ZMK version.
 */
export async function newConfig(
  keyboard: KeyboardDef,
  options: NewConfigOptions,
  fetchText: FetchText = defaultFetchText,
): Promise<{ config: ZmkConfig; warnings: string[] }> {
  const base = `https://raw.githubusercontent.com/zmkfirmware/zmk/${options.zmkVersion}/`;
  const keymapText = keyboard.keymapPath ? await fetchText(base + keyboard.keymapPath) : '';
  const confText = keyboard.confPath ? await fetchText(base + keyboard.confPath).catch(() => '') : '';
  const { model, warnings } = importKeymap(keymapText);
  return {
    config: {
      keyboard: keyboard.configName,
      keymap: model,
      kconfig: parseKconfig(confText),
      west: { zmkVersion: options.zmkVersion, modules: [], selfPath: 'config' },
      build: { include: buildTargets(keyboard, options.controller, { niceView: options.niceView }) },
    },
    warnings,
  };
}
