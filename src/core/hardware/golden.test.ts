import { describe, expect, it } from 'vitest';
import { hardwareBuildTargets } from './config.ts';
import { setDisplay } from './displays.ts';
import { generateShield } from './generate.ts';
import { DEFAULT_BASICS, gridHardware } from './grid.ts';
import { testPad } from './testFixtures.ts';
import type { KeyboardHardware } from './types.ts';
import { validateHardware } from './validate.ts';

/**
 * Every file generated for Pro Micro designs, locked in before the interconnect
 * refactor: designs people already have must keep generating the same shield.
 */
const proMicroSplit: KeyboardHardware = {
  ...setDisplay(
    setDisplay(
      gridHardware({
        ...DEFAULT_BASICS,
        name: 'golden_split',
        displayName: 'Golden Split',
        rows: 2,
        cols: 3,
        diodeDirection: 'row2col',
      }),
      'left',
      'oled_128x32',
    ),
    'right',
    'oled_128x64',
  ),
  wiring: {
    kind: 'matrix',
    diodeDirection: 'row2col',
    rows: [4, 5],
    cols: [6, 7, 8],
    right: { rows: [9, 10], cols: [14, 15, 16] },
  },
  encoders: [{ a: 18, b: 19 }],
  rightEncoders: [{ a: 20, b: 21 }],
};

const proMicroPad: KeyboardHardware = { ...setDisplay(testPad, undefined, 'nice_view'), encoders: [{ a: 8, b: 9 }] };

describe('Pro Micro shields (golden)', () => {
  it('generates the same split with encoders and OLEDs', () => {
    expect(generateShield(proMicroSplit)).toMatchSnapshot();
  });

  it('generates the same one-piece direct-wired pad with a nice!view', () => {
    expect(generateShield(proMicroPad)).toMatchSnapshot();
  });
});

/** The Subsata boards, proven on hardware with hand-written shields (ooepi/zmk-config-grstn-subsata). */
const outputs = Array.from({ length: 16 }, (_, i) => ({ sr: i }));
const subsata = (name: string, rows: number[], direct: number[]): KeyboardHardware => ({
  ...gridHardware({ ...DEFAULT_BASICS, name, displayName: 'Subsata', split: false, rows: 6, cols: 18 }),
  wiring: { kind: 'matrix', diodeDirection: 'col2row', rows, cols: [...outputs, ...direct] },
});
const subsataV1: KeyboardHardware = {
  ...subsata('subsata', [2, 3, 4, 5, 6, 7], [1, 0]),
  shiftRegisters: { count: 2, latch: 21, data: 19, clock: 20, ownBus: true },
  displays: { left: 'nice_view' },
  displayPins: { left: { cs: 10, data: 14, clock: 16 } },
};
const subsataV2: KeyboardHardware = {
  ...subsata('subsata_v2', [8, 9, 14, 15, 18, 19], [20, 21]),
  shiftRegisters: { count: 2, latch: 0 },
  displays: { left: 'nice_view' },
};

describe('Subsata shields (hand-written, proven on hardware)', () => {
  const overlay = (hw: KeyboardHardware) => generateShield(hw)[`config/boards/shields/${hw.name}/${hw.name}.overlay`] ?? '';

  it('v1: rows D2–D7, columns 0–15 on the 595s and 16–17 on D1/D0, two separate buses', () => {
    const text = overlay(subsataV1);
    expect(validateHardware(subsataV1).filter((i) => i.level === 'error')).toEqual([]);
    expect(text).toContain('= <&pro_micro  2 (GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)>');
    expect(text).toContain(', <&shifter 15 GPIO_ACTIVE_HIGH>\n            , <&pro_micro  1 GPIO_ACTIVE_HIGH>\n            , <&pro_micro  0 GPIO_ACTIVE_HIGH>');
    expect(text).toContain('<NRF_PSEL(SPIM_SCK, 0, 29)>,\n                <NRF_PSEL(SPIM_MOSI, 0, 2)>');
    expect(text).toContain('cs-gpios = <&pro_micro 21 GPIO_ACTIVE_LOW>;');
    expect(text).toContain('nice_view_spi: &pro_micro_spi {');
    expect(text).toContain('<NRF_PSEL(SPIM_SCK, 0, 10)>,\n                <NRF_PSEL(SPIM_MOSI, 1, 11)>');
    expect(text).toContain('cs-gpios = <&pro_micro 10 GPIO_ACTIVE_HIGH>;');
    expect(text).toContain('ngpios = <16>;');
  });

  it('v2: one bus shared with the nice!view (clock D3, data D2, CS D1, latch D0)', () => {
    const text = overlay(subsataV2);
    expect(validateHardware(subsataV2).filter((i) => i.level === 'error')).toEqual([]);
    expect(text).toContain('= <&pro_micro  8 (GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)>');
    expect(text).toContain(', <&shifter 15 GPIO_ACTIVE_HIGH>\n            , <&pro_micro 20 GPIO_ACTIVE_HIGH>\n            , <&pro_micro 21 GPIO_ACTIVE_HIGH>');
    expect(text).toContain('<NRF_PSEL(SPIM_SCK, 0, 20)>,\n                <NRF_PSEL(SPIM_MOSI, 0, 17)>');
    expect(text).toContain('cs-gpios = <&pro_micro 1 GPIO_ACTIVE_HIGH>, <&pro_micro 0 GPIO_ACTIVE_LOW>;');
    expect(text).toContain('ngpios = <16>;');
    expect(hardwareBuildTargets(subsataV2)[0]?.shield).toBe('subsata_v2 nice_view');
  });
});
