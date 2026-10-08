# Shift registers (74HC595) in the keyboard wizard: design

## Context

The keyboard wizard wires every matrix row and column to a controller pin. A Pro Micro has 18 pins and a Seeed XIAO 11, so big one-piece boards run out: a 6 × 18 matrix needs 24. The usual fix is a chain of 74HC595 shift registers, which turns three controller pins into 8, 16, 24 or 32 outputs.

The Subsata keyboard (Grstn90Plus) was the trigger. Its shields were written by hand (`ooepi/zmk-config-grstn-subsata`) and are proven on hardware:
- **v1:** 6 rows on D2–D7, columns 0–15 on two chained 595s, columns 16/17 on D1/D0; the 595s on their own SPI bus (data D19, clock D20, latch D21) and a nice!view on another bus.
- **v2:** rows on D8, D9, D14, D15, D18, D19; columns 0–15 on the 595s, 16/17 on D20/D21; one SPI bus shared by the nice!view and the 595s (clock D3, data D2, nice!view CS D1, latch D0).

Approved in chat on 2026-10-08:
- **One-piece keyboards only.** Split boards with shift registers are rare enough to leave out.
- **Only the 74HC595**, chained 1–4 deep, which is what ZMK's `zmk,gpio-595` driver supports.
- **Outputs work like pins** (approach A): each driven line's picker offers shift register outputs next to D-pins, and turning shift registers on fills them in order. Rejected: a fixed block of the first N columns (can't describe a PCB with outputs in another order), and a general I/O-expander system (more abstraction than the 595 needs).
- **LEDs and power switching are out of scope.**
- **Shared or separate bus with a nice!view** (decided while planning, 2026-10-08): data and clock start out shared with the nice!view (one bus, like v2). A checkbox puts the shift registers on their own pins instead (like v1).

## Facts from ZMK v0.3

- **The driver** (`app/module/drivers/gpio/gpio_595.c`, docs page "Shift registers"): an SPI device with `compatible = "zmk,gpio-595"`, `gpio-controller`, `#gpio-cells = <2>`, `reg`, `spi-max-frequency` and `ngpios` (8 per register, at most 32). Its pins are used as `<&shifter N GPIO_ACTIVE_HIGH>`.
- **Pin order:** the driver sends the lowest byte last, so it stays in the first register in the chain. Output N is register N / 8 (the one wired to the controller is register 0), pin Q(A + N mod 8). The Subsata shields use exactly this.
- **Outputs only:** the docs require the matrix inputs on controller pins, so interrupt-driven scanning still works. Outputs therefore go on the driven lines: columns for `col2row`, rows for `row2col`.
- **Latch:** RCLK is the SPI chip select, active low. The 595 copies its shift register to the outputs when RCLK rises, i.e. when the chip select is released after a transfer.
- **`SPI` must be on** (`config SPI default y` in the shield's `Kconfig.defconfig`).
- **The nice!view** only needs an SPI bus labelled `&nice_view_spi`. Its CS is active high. ZMK's `nice_view_adapter` defines that bus with a single CS, so it can't carry a second device; with shift registers the editor writes the bus itself, as it already does for moved display pins.
- **SPI instances** (see `2026-09-30-display-pins-design.md`): `pro_micro_spi` is SPI1 on most boards and SPI0 on Puchi-BLE and Mikoto v6+; `xiao_spi` is SPI2. On the nRF52840, SPI0 shares hardware with TWI0 and SPI1 with TWI1; SPI2 shares with neither, and no supported board uses it for anything else.

## Model

`types.ts`:

```ts
/** A driven matrix line can be a controller pin or a shift register output. */
export type ShiftOutput = { sr: number };
export type LinePin = Pin | ShiftOutput;

export interface MatrixWiring {
  kind: 'matrix';
  diodeDirection: DiodeDirection;
  rows: LinePin[];
  cols: LinePin[];
  right?: MatrixPins;           // unchanged; splits never have shift registers
}

/** 74HC595s chained on an SPI bus; one-piece keyboards only. */
export interface ShiftRegisters {
  /** 1 to 4; 8 outputs each. */
  count: number;
  /** RCLK, the SPI chip select. */
  latch: Pin;
  /** SER (MOSI) and SRCLK (SCK) moved off their defaults; ignored while the bus is shared with a nice!view. */
  data?: Pin;
  clock?: Pin;
  /** With a nice!view: true puts the shift registers on their own data and clock pins instead of sharing its bus. */
  ownBus?: boolean;
}

export interface KeyboardHardware { … shiftRegisters?: ShiftRegisters; }
```

- **Default data and clock** are the interconnect's SPI pins, the nice!view defaults: Pro Micro D2/D3, XIAO D10/D8. A field is stored only when moved, the same rule display pins use.
- **With a nice!view,** data and clock are the display's data and clock pins (one bus, one source of truth), unless `ownBus` is set. Then they're the shift registers' own pins, with the same defaults as without a display; if those collide with the display's pins, validation says so.
- **The bus is shared** exactly when the keyboard has a nice!view and `ownBus` isn't set.
- **New helpers** (`shiftRegisters.ts`):
  - `shiftPins(hw)` gives the effective `{ latch, data, clock, shared }`, where `shared` says whether data and clock come from the nice!view.
  - `outputLabel(n)` gives "Output 9 (U2 QB)". U1 is the register wired to the controller.
  - `setShiftRegisterCount(hw, count | 0)` turns them on, changes the count or turns them off:
    - **On:** driven line `i` gets output `i` for every `i` below the line count and the output count. Other lines keep their pins.
    - **Fewer:** lines on outputs that no longer exist become `null`.
    - **Off:** every output becomes `null` and `shiftRegisters` is removed.
  - `setShiftPin(hw, 'latch' | 'data' | 'clock', pin)` (data and clock are ignored while the bus is shared).
  - `setShiftOwnBus(hw, on)` sets or clears `ownBus`.
- **`setPin`** accepts a `LinePin` for `rows` and `cols`.
- **Making the keyboard split** (basics step) turns shift registers off first.
- **Existing helpers** that take pins from matrix lines treat outputs as "not a controller pin": `pinUses`, the pinout, validation's pin list, and the basics pin count.

## File format

`definition.ts`:
- **Lines:** `"cols": [{ "sr": 0 }, …, { "sr": 15 }, 20, 21]`. Parsing accepts a number, `null` or `{ "sr": <integer ≥ 0> }`.
- **The block:** `"shiftRegisters": { "count": 2, "latch": 0 }`, plus `"data"` and `"clock"` when moved and `"ownBus": true` when set, in that order. It goes after `displayPins` and before `encoderSpots`.
- **Version 3** is written only when `shiftRegisters` is present or any line holds an output. Otherwise the file is written exactly as today (version 1, or 2 with display pins), so existing keyboards' files don't change. Version 3 files can only be read by this version of the editor or later; older editors report "update the editor".

## Wizard

**Basics step:**
- **New field "Shift registers (74HC595)":** none / 1 / 2 / 3 / 4, shown for one-piece matrix keyboards only.
- **The pin-count check becomes:**

  `needed = input lines + max(0, driven lines − 8 × count) + (count > 0 ? 3 : 0)`

  Its message names the shift registers, e.g. "A 6 × 18 matrix with 2 shift registers needs 11 pins…". When the basics are applied to a new keyboard, `setShiftRegisterCount` runs, so the outputs are filled before the wiring step.

**Wiring step:**
- **A "Shift registers" fieldset** (one-piece, matrix only) with:
  - the count select (same choices as basics);
  - **Latch**, **Data** and **Clock** pickers, which arm the pinout like other pin fields;
  - with a nice!view, a checkbox **"Shift registers on their own pins"** (off by default). Off: Data and Clock show as text, "Shared with the nice!view (D2)", instead of pickers. On: their own pickers;
  - one muted sentence: which three 595 pins they are (RCLK, SER, SRCLK), that U1 is the 595 wired to the controller, and that the chain continues from its QH′ to the next one's SER.
- **Each driven line's picker** gets an `<optgroup label="Shift register outputs">` listing every output with `outputLabel`, and other uses of each output in brackets, like pins. The input lines' pickers never list outputs.
- **The pinout** gives the latch, data and clock pads a "shift register" colour (a new class next to the existing pad-use classes) with their use in the tooltip. Lines on outputs aren't on the pinout.

**Review step:** a line such as "Columns 0–15 on 2 shift registers (74HC595)", listing the driven lines that use outputs.

## Validation

All in `validateHardware`, area `wiring`, level `error`:
- **Not one-piece or not a matrix:** "Shift registers only work on one-piece keyboards with a matrix."
- **An output on an input line:** "Row 2 uses a shift register output, but shift registers can only drive columns on this matrix (col2row). Use a pin, or switch the diode direction." Mirrored for `row2col`.
- **An output beyond the chain:** "Column 3 uses output 20, but 2 shift registers have 16 outputs (0–15)."
- **An output used twice:** "Output 4 is used for both Column 4 and Column 9."
- **A latch, data or clock pin** that's missing, not on the controller, or used twice: they join the existing labelled pin list as "Shift register latch/data/clock". While the bus is shared, data and clock aren't added again (no false conflict). On their own bus they are, so a clash with the display's pins is reported.
- **The count** is outside 1–4.

## Generated shield

`generate.ts`, one-piece only (`rootFile` with pins):
- **kscan:** an output line is `<&shifter N GPIO_ACTIVE_HIGH>`; pins are unchanged, so the two mix.
- **On their own bus** (no nice!view, or `ownBus`): a new section after the root block:
  ```
  &pinctrl { shift_register_spi_default … shift_register_spi_sleep … }   // SCK = clock, MOSI = data
  &spi2 {
      status = "okay";
      compatible = "nordic,nrf-spim";
      pinctrl-0/1, pinctrl-names;
      cs-gpios = <&<gpio> <latch> GPIO_ACTIVE_LOW>;
      shifter: 595@0 { compatible = "zmk,gpio-595"; status = "okay"; gpio-controller;
          spi-max-frequency = <1000000>; reg = <0>; #gpio-cells = <2>; ngpios = <8 × count>; };
  };
  ```
  SPI2 leaves the I2C units alone, so an OLED keeps working, and 1 MHz is safe on any pin. A nice!view next to it keeps its own bus, through the adapter or its own SPI bus as today.
- **Sharing the nice!view's bus:** `niceViewBus` writes the shared bus:
  - `cs-gpios = <nice!view CS GPIO_ACTIVE_HIGH>, <latch GPIO_ACTIVE_LOW>`;
  - the `shifter: 595@1` child, with `reg = <1>`;
  - it is always used while the bus is shared: `usesNiceViewAdapter` returns false then, and `applyHardware` already drops `nice_view_adapter` from the build when that answer changes.
- **`Kconfig.defconfig`** gets `config SPI\n    default y` inside the shield's `if` block when shift registers are present.
- **Unchanged:** keyboards without shift registers generate byte-identical files.

## Help and README

- **Help, Custom keyboards section:** a "Shift registers" subsection, a few sentences on:
  - when you need them (more lines than pins);
  - the three pins;
  - that outputs drive columns on col2row (rows on row2col);
  - how outputs are numbered across the chain;
  - that a nice!view shares data and clock.
- **README feature list:** add shift registers to the "Any ZMK keyboard, or your own" item.

## Testing

- **`definition.test.ts`:**
  - Files without shift registers serialize unchanged (version 1 and 2 fixtures).
  - Version 3 round-trips.
  - Bad `{ sr }` entries and a bad `shiftRegisters` block give errors.
- **`shiftRegisters.test.ts`:**
  - `setShiftRegisterCount`: on, fewer, more, off; and row2col fills rows.
  - `shiftPins` defaults, moved pins, sharing with a nice!view, and `ownBus`.
  - `outputLabel` numbering.
- **`validate.test.ts`:** each error above, no conflict for shared data and clock, and a reported clash on an own bus that reuses the display's pins.
- **`generate.test.ts`:**
  - Snapshots for shift registers alone, sharing a nice!view's bus, next to a nice!view on their own bus, and with an OLED.
  - The `Kconfig.defconfig` SPI line.
  - Unchanged output without shift registers.
- **`golden.test.ts`, Subsata reference:**
  - Both Subsata boards described as `KeyboardHardware` (matrix and bus only).
  - The generated kscan pins and buses match the hand-written v1 and v2 shields: rows, `&shifter 0–15` plus the two direct columns, `ngpios = <16>`, latch and chip selects; v1's nice!view on its own bus (D14/D16/D10) and its shift registers on theirs (D19/D20/D21).
- **UI tests (testing-library):**
  - The count in the wiring step fills the columns.
  - A driven line's picker lists outputs; an input line's doesn't.
  - Data and Clock read "Shared with the nice!view" when there's one, and become pickers when "Shift registers on their own pins" is ticked.
  - The basics pin count accepts 6 × 18 with 2 shift registers.
- **Firmware build check:** three new fixtures in `test/generated/`, built by `.github/workflows/firmware.yml` with ZMK's toolchain:
  - `editor_shift` (shift registers alone),
  - `editor_shift_view` (with a nice!view),
  - `editor_shift_oled` (with an OLED).

  `test/customKeyboards.test.ts` writes them like the other editor fixtures.
