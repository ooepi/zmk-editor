# Display pins you can change: design

## Context

The keyboard wizard puts displays on fixed pins:
- a nice!view uses D1 (CS), D2 (data) and D3 (clock), through ZMK's `nice_view_adapter`;
- an OLED uses the controller's I2C pins: D2/D3 on a Pro Micro, D4/D5 on a Seeed XIAO.

People wire displays to other pins. A nice!view isn't offered on a XIAO at all, because the adapter only fits Pro Micro boards (see `2026-09-30-interconnects-xiao-design.md`). This change lets each half's display pins be chosen like row, column and encoder pins. As a result, the nice!view also works on a XIAO.

Approved in chat on 2026-09-30:
- **Any free pin** can be used for any display signal.
- **A nice!view on a XIAO** defaults to clock D8, data D10 and CS D9.
- **The approach** is hardware SPI/I2C with pinctrl, using each board's pin map. Bit-banged buses were rejected, because they cost CPU and battery and no ZMK shield uses them.

## Facts from ZMK v0.3

- **The `nice_view` shield** only needs an SPI bus labelled `&nice_view_spi`, with MOSI, SCK and CS (its README). Screen modules that replace `nice_view` use the same label.
- **`nice_view_adapter`** is only per-board overlays. Each one defines `&pinctrl { spi0_default … spi0_sleep … }` with `NRF_PSEL(SPIM_SCK|MOSI|MISO, port, pin)`, and then:
  ```
  nice_view_spi: &spi0 {
      compatible = "nordic,nrf-spim";
      pinctrl-0 = <&spi0_default>; pinctrl-1 = <&spi0_sleep>; pinctrl-names = "default", "sleep";
      cs-gpios = <&pro_micro 1 GPIO_ACTIVE_HIGH>;
  };
  &pro_micro_i2c { status = "disabled"; };
  ```
  Its `.conf` sets `CONFIG_SSD1306=n`.
- **Pinctrl needs real nRF52840 pins** (port, pin), which differ per board. The `&pro_micro` D-pin maps from `app/boards/arm/*/arduino_pro_micro_pins*.dtsi`:

  | D | nice!nano v1/v2 | nRFMicro 1.1, 1.3 / Puchi-BLE | BlueMicro840 | nRFMicro 1.1 flipped | Mikoto (5.20) |
  |---|---|---|---|---|---|
  | D0 | P0.08 | P0.08 | P0.08 | P0.08 | P0.04 |
  | D1 | P0.06 | P0.06 | P0.06 | P0.06 | P0.08 |
  | D2 | P0.17 | P0.15 | P0.15 | P0.30 | P0.17 |
  | D3 | P0.20 | P0.17 | P0.17 | P0.31 | P0.20 |
  | D4 | P0.22 | P0.20 | P0.20 | P0.29 | P0.22 |
  | D5 | P0.24 | P0.13 | P0.13 | P0.02 | P0.24 |
  | D6 | P1.00 | P0.24 | P0.24 | P1.13 | P1.00 |
  | D7 | P0.11 | P0.09 | P0.09 | P0.03 | P1.02 |
  | D8 | P1.04 | P0.10 | P0.10 | P0.28 | P1.04 |
  | D9 | P1.06 | P1.06 | P1.06 | P1.11 | P1.06 |
  | D10 | P0.09 | P1.11 | P1.11 | P1.06 | P0.09 |
  | D14 | P1.11 | P0.03 | P0.03 | P0.09 | P1.13 |
  | D15 | P1.13 | P1.13 | P1.13 | P0.24 | P0.02 |
  | D16 | P0.10 | P0.28 | P0.28 | P0.10 | P0.10 |
  | D18 | P1.15 | P0.02 | P0.02 | P0.13 | P0.29 |
  | D19 | P0.02 | P0.29 | P0.29 | P0.20 | P0.31 |
  | D20 | P0.29 | P0.31 | P0.26 | P0.17 | P0.25 |
  | D21 | P0.31 | P0.30 | P0.30 | P0.15 | P0.11 |

  - `nice_nano` and `nice_nano_v2` share `nice_nano.dtsi`.
  - `nrfmicro_11` and `nrfmicro_13` share one map; `nrfmicro_11_flipped` has its own.
  - **Mikoto** defaults to revision 5.20.0. Revisions 6.1.0+ differ only in D6 (P1.08).
  - The XIAO nRF52840 map is already in `interconnects.ts`.
- **SPI and I2C instances:**
  - `pro_micro_spi` is `&spi1` on most boards and `&spi0` on Puchi-BLE and Mikoto v6+; `pro_micro_i2c` is `&i2c0`. On the nRF52840, SPI0 and TWI0 share hardware, which is why the adapter disables `&pro_micro_i2c`.
  - `xiao_spi` is `&spi2` and `xiao_i2c` is `&i2c1`.

## Model

- `DisplaySignal = 'cs' | 'data' | 'clock' | 'sda' | 'scl'`.
  - A nice!view uses `cs`, `data` and `clock` ("Display CS", "Display data", "Display clock").
  - An OLED uses `sda` and `scl` ("Display SDA", "Display SCL").
- `KeyboardHardware.displayPins?: { left?: Partial<Record<DisplaySignal, Pin>>; right?: … }`. These are overrides of the defaults, per half, and a one-piece keyboard uses `left`.
- **Defaults**, `defaultDisplayPins(kind, ic)`:
  - nice!view on a Pro Micro: cs D1, data D2, clock D3 (the adapter's pins).
  - nice!view on a XIAO: cs D9, data D10, clock D8.
  - OLED: `ic.i2cPins`.
- `displayPins(kind, ic, overrides)` returns the effective `{ signal, pin, use }[]`: the defaults with the overrides applied. `pinUses` and validation use it.
- `setDisplayPin(hw, side, signal, pin)`: setting a pin equal to the default removes the override, and an empty half or map is removed too.
  - `setDisplay` (changing a half's display kind) removes that half's overrides.
  - Changing the controller keeps the overrides (keep and flag); signals without an override take the new controller's defaults, so a XIAO nice!view on its defaults moves to D1/D2/D3 (through the adapter) on a Pro Micro.
  - `setDisplayPin` ignores signals the half's display doesn't have. Empty overrides are dropped when a definition is read.
- **Whether a half uses the adapter**, `usesNiceViewAdapter(hw, side)`: a nice!view where `ic.niceViewAdapter` is true and the effective pins equal the adapter's.
- **Definitions** (`definition.ts`): `displayPins` is written as `{ "left": { "cs": 5 } }` when present, and the file is then written as version 2. Without it the file stays version 1, byte for byte. Parsing accepts versions 1 and 2, and validates signal names and pins.

## Board pin maps (`interconnects.ts`)

- `HeaderPad.mcu` gets entries for every offered controller: `nice_nano`, `nice_nano_v2`, `nrfmicro_11`, `nrfmicro_13`, `nrfmicro_11_flipped`, `bluemicro840_v1`, `puchi_ble_v1`, `mikoto` and `seeeduino_xiao_ble`, from the table above.
  - The pinout already shows `mcu[controller]` as a sub-label, so every board now shows its nRF pins.
  - The flipped nRFMicro keeps the same pads with different nRF pins, which is what its map says.
- `nrfPin(controller, pin): { port: number; pin: number } | undefined` parses `P1.06` into `{ port: 1, pin: 6 }`.

## Generator

- **No change when every display is on its default pins**, with one exception: a nice!view on a XIAO, which never had an adapter. The golden tests stay green.
- **A nice!view that doesn't use the adapter.** The half's overlay (the root overlay on a one-piece keyboard) gets:
  ```
  &pinctrl {
      nice_view_spi_default: nice_view_spi_default {
          group1 {
              psels = <NRF_PSEL(SPIM_SCK, 1, 13)>,
                  <NRF_PSEL(SPIM_MOSI, 1, 15)>;
          };
      };
      nice_view_spi_sleep: nice_view_spi_sleep {
          group1 {
              psels = <NRF_PSEL(SPIM_SCK, 1, 13)>,
                  <NRF_PSEL(SPIM_MOSI, 1, 15)>;
              low-power-enable;
          };
      };
  };

  nice_view_spi: &xiao_spi {              // &pro_micro_spi on a Pro Micro
      compatible = "nordic,nrf-spim";
      pinctrl-0 = <&nice_view_spi_default>;
      pinctrl-1 = <&nice_view_spi_sleep>;
      pinctrl-names = "default", "sleep";
      cs-gpios = <&xiao_d 9 GPIO_ACTIVE_HIGH>;
  };

  &xiao_i2c {                             // &pro_micro_i2c on a Pro Micro
      status = "disabled";
  };
  ```
  There is no MISO: the display doesn't send data, and Zephyr's SPIM driver leaves unset pins disconnected.
- **An OLED on non-default pins.** The overlay gets pinctrl nodes `oled_i2c_default`/`oled_i2c_sleep` with `NRF_PSEL(TWIM_SDA, …)` and `NRF_PSEL(TWIM_SCL, …)`. The existing `&pro_micro_i2c`/`&xiao_i2c` block also gets `pinctrl-0`, `pinctrl-1` and `pinctrl-names` lines after `status = "okay";`.
- **Pins without an nRF mapping** (a `null` pin, or a pin the board doesn't have) can't happen in a saved design, because validation blocks saving. The generator writes `?`, as it does for kscan pins.

## Build and Screens

- **`hardwareBuildTargets`/`applyHardware`:**
  - A half's nice!view shields are `nice_view_adapter <screen>` when the half uses the adapter, and just `<screen>` otherwise (`<screen>` is `nice_view` or a catalog screen).
  - Switching between the two (pins changed, or the controller changed) swaps the shields and keeps the chosen screen.
  - The XIAO rule from the previous change (drop hand-added nice!view shields) now only drops `nice_view_adapter`. The screen stays, because the shield defines `nice_view_spi` itself when the half has a nice!view. When the half has no nice!view in the model, both are dropped, as before.
- **`screenSlots`:** a build is a nice!view slot when it has `nice_view_adapter` or a catalog screen shield (`SCREEN_SHIELDS`). This keeps the Screens tab working for adapter-less builds. The `ScreensView` empty-state text about the XIAO goes away.

## Validation

- **Each display signal needs a pin:** "Display CS on the left half has no pin."
- **Pins outside the footprint** and **clashes** are checked as today, because `labelled` uses the effective pins.
- **The nice!view-on-XIAO error is removed.** Every display is offered on every footprint (`availableDisplays` was dropped).
- **Warning** when a Mikoto display uses D6: "Display clock on the left half uses D6, which is a different pin on Mikoto v6 and later; the build assumes Mikoto 5.20."

## Wizard UI

- **Displays fieldset:** under each half's display select, the display's pin fields ("Left display CS", "Left display data", "Left display clock", or "… SDA", "… SCL").
  - They are `PinSelect`s with new `PinList` values (`display.cs` and so on), so they list the footprint's pins, show other uses, keep pins not on this controller, and arm that half's pinout for click-to-assign.
  - A mirrored right half's display fields have no pinout of their own (the one pinout is the left half's), so they use the select.
  - "Use the standard pins" (a link button) clears the half's overrides. It is shown only when there are overrides.
- **Help text:** "A nice!view defaults to D1 (CS), D2 (data) and D3 (clock) through ZMK's adapter; on other pins, or on a Seeed XIAO (D9, D10, D8), the shield sets up its own SPI bus and builds without the adapter. OLEDs default to the controller's I2C pins." The Help page's wizard section is updated to match.

## Testing

- **Golden tests** unchanged.
- **Core:**
  - defaults per footprint and kind;
  - overrides, including removal when equal to the default, and the kind change clearing them;
  - `usesNiceViewAdapter`;
  - `nrfPin` for nice!nano, Puchi-BLE and the XIAO;
  - a definition round trip (version 2 only with overrides; version 1 files unchanged; bad signal names rejected);
  - generator output:
    - a nice!view on nice!nano with CS D5 (pinctrl P0.17/P0.20, `&pro_micro_spi`, cs `&pro_micro 5`, i2c disabled, no adapter);
    - a XIAO nice!view on defaults;
    - an OLED on Puchi-BLE with SDA D4/SCL D5 (P0.20, P0.13);
  - build targets with and without the adapter, keeping a Screens replacement;
  - `screenSlots` without the adapter;
  - validation: no pin, clash, and the Mikoto D6 warning.
- **UI:**
  - pick a display pin by select and by pinout;
  - "Use the standard pins";
  - a XIAO nice!view shows D9/D10/D8, and the saved build has `nice_view` without the adapter.

## Out of scope

- Mikoto revisions other than 5.20 (they differ only in D6; a warning covers it).
- Displays other than the nice!view and SSD1306 128×32/128×64.
- Two displays on one half.
- An SPI MISO pin.
