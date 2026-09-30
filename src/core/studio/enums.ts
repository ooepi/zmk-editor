/**
 * The numbers behind the enum tokens of built-in behaviors (`&bt BT_SEL 0`, `&mkp MB1`, …), from the
 * ZMK v0.3 headers (bt.h, outputs.h, rgb.h, backlight.h, ext_power.h, pointing.h). ZMK Studio only
 * sends numbers; these turn them back into the tokens a keymap uses. A token standing for fewer cells
 * than the behavior takes (`BT_SEL`) is followed by a number param.
 */
const MOVE = 600;
const SCRL = 10;
const y = (v: number) => v & 0xffff;
const x = (v: number) => ((v & 0xffff) << 16) >>> 0;

const ENUMS: Record<string, { cells: number; tokens: [string, number[]][] }> = {
  bt: {
    cells: 2,
    tokens: [
      ['BT_CLR', [0, 0]],
      ['BT_NXT', [1, 0]],
      ['BT_PRV', [2, 0]],
      ['BT_SEL', [3]],
      ['BT_CLR_ALL', [4, 0]],
      ['BT_DISC', [5]],
    ],
  },
  out: { cells: 1, tokens: [['OUT_TOG', [0]], ['OUT_USB', [1]], ['OUT_BLE', [2]]] },
  rgb_ug: {
    cells: 2,
    tokens: ['RGB_TOG', 'RGB_ON', 'RGB_OFF', 'RGB_HUI', 'RGB_HUD', 'RGB_SAI', 'RGB_SAD', 'RGB_BRI', 'RGB_BRD', 'RGB_SPI', 'RGB_SPD', 'RGB_EFF', 'RGB_EFR'].map(
      (token, i): [string, number[]] => [token, [i, 0]],
    ),
  },
  bl: {
    cells: 2,
    tokens: [
      ['BL_ON', [0, 0]],
      ['BL_OFF', [1, 0]],
      ['BL_TOG', [2, 0]],
      ['BL_INC', [3, 0]],
      ['BL_DEC', [4, 0]],
      ['BL_CYCLE', [5, 0]],
      ['BL_SET', [6]],
    ],
  },
  ext_power: { cells: 1, tokens: [['EP_OFF', [0]], ['EP_ON', [1]], ['EP_TOG', [2]]] },
  mkp: {
    cells: 1,
    tokens: [
      ['MB1', [1]],
      ['MB2', [2]],
      ['MB3', [4]],
      ['MB4', [8]],
      ['MB5', [16]],
      ['LCLK', [1]],
      ['RCLK', [2]],
      ['MCLK', [4]],
    ],
  },
  mmv: {
    cells: 1,
    tokens: [
      ['MOVE_UP', [y(-MOVE)]],
      ['MOVE_DOWN', [y(MOVE)]],
      ['MOVE_LEFT', [x(-MOVE)]],
      ['MOVE_RIGHT', [x(MOVE)]],
    ],
  },
  msc: {
    cells: 1,
    tokens: [
      ['SCRL_UP', [y(SCRL)]],
      ['SCRL_DOWN', [y(-SCRL)]],
      ['SCRL_LEFT', [x(-SCRL)]],
      ['SCRL_RIGHT', [x(SCRL)]],
    ],
  },
};

/** How many cells an enum behavior takes (`&bt`: 2), or undefined for other behaviors. */
export function enumCellCount(ref: string): number | undefined {
  return ENUMS[ref]?.cells;
}

/** The cells an enum token stands for, e.g. `BT_CLR` → [0, 0]. */
export function enumCells(ref: string, token: string): number[] | undefined {
  return ENUMS[ref]?.tokens.find(([t]) => t === token)?.[1];
}

/** The params for an enum behavior's cells, e.g. [3, 1] → `BT_SEL 1`. The first matching token wins. */
export function decodeEnum(ref: string, cells: number[]): string[] | undefined {
  const table = ENUMS[ref];
  if (!table) return undefined;
  const [first, second = 0] = cells;
  for (const [token, values] of table.tokens) {
    if (values.length === table.cells && values[0] === first && (table.cells === 1 || values[1] === second)) return [token];
  }
  for (const [token, values] of table.tokens) {
    if (values.length < table.cells && values[0] === first) return [token, String(second)];
  }
  return undefined;
}
