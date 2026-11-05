# LEDs (RGB underglow and single-colour backlight) in the keyboard wizard: design

## Intent

People designing their own keyboard in the wizard can describe its LEDs, and the editor writes a ZMK shield that drives them. Today a designed keyboard can't have LEDs at all. Its Settings page shows "doesn’t have this hardware yet" for RGB underglow and Backlight, and hand edits to the shield don't survive, because the editor regenerates the shield files whenever the hardware is edited.

The trigger is the Gristone Subsata v2: 20 SK6812MINI-E LEDs on D4, with a load switch on D5 that cuts their power. Its hand-written shield (`ooepi/zmk-config-grstn-subsata`, branch `subsata-v2`, `boards/shields/subsata_v2`) is the reference for the generated output. Single-colour backlight is wanted too, for other people's boards, even though nobody can test it on hardware yet.

## Agreed in chat (2026-11-06)

- **Both kinds:** RGB underglow (a chain of addressable LEDs: WS2812, SK6812 and the like) and single-colour backlight (LEDs dimmed together from one PWM pin). A board can have either, both or neither.
- **Optional power pin:** either kind can have an on/off pin for the LEDs' power (a load switch or MOSFET), so turning the LEDs off really cuts their power.
- **One-piece and split keyboards.** On a split, the right half copies the left (same pins, same number of LEDs) unless "The right half is wired differently" is ticked; then each half has its own.
- **Proof:**
  - **Underglow:** the generated output matches the hand-written Subsata v2 shield (golden test), firmware fixtures build in CI, and the user tests on the real board.
  - **Backlight:** firmware fixtures build in CI and follow ZMK's documented setup. Hardware testing comes later.
- **Settings:** adding LEDs in the wizard switches the matching setting on (`CONFIG_ZMK_RGB_UNDERGLOW=y` / `CONFIG_ZMK_BACKLIGHT=y`), and the Settings sections unlock.
- **Keymap:** the editor doesn't place LED keys. `&rgb_ug`, `&bl` and `&ext_power` are already in the palette, and Settings already warns, with a one-click fix, when there are LED keys but the LEDs are off. (My call: automatic placement has no natural spot on someone's layout.)

## Goals, non-goals, anti-goals

**Goals**
- Describe underglow (data pin, number of LEDs), backlight (pin) and an optional power pin, per half, in the Wiring step.
- Generate a shield that builds and drives them, alongside shift registers, a nice!view or an OLED without clashing.
- Clear validation messages that say what to do, unlike the OLED and shift register confusion (where the editor reported two pin clashes but didn't say that I2C and SPI can't share pins).

**Non-goals**
- Per-key RGB effects (ZMK v0.3 has none; addressable LEDs under keys are still driven as "underglow").
- RGBW LEDs, a choice of colour order, several LED chains per half.
- Brightness or current limits in the wizard (they're on the Settings page).
- Placing LED keys in the keymap.

**Anti-goals** (failures even if it builds)
- A shield where turning the LEDs off also cuts power to the shift registers or the display.
- LED settings unlocked, or switched on, without the hardware described: the firmware wouldn't build.
- Any change to keyboards without LEDs: their definition and shield files must stay byte-identical.

## Facts from ZMK v0.3 and the reference shield

- **Underglow:** a `worldsemi,ws2812-spi` child of an SPI unit, with `chosen { zmk,underglow = &led_strip; }`. Only MOSI is routed. The v2 shield uses:
  - `&spi3`;
  - `spi-max-frequency = <4000000>`, `spi-one-frame = <0x70>`, `spi-zero-frame = <0x40>`;
  - `color-mapping = <LED_COLOR_ID_GREEN LED_COLOR_ID_RED LED_COLOR_ID_BLUE>` (WS2812 and SK6812 are GRB);
  - `chain-length = <N>` and `#include <dt-bindings/led/led.h>`.

  `Kconfig.defconfig` sets `SPI` and, inside `if ZMK_RGB_UNDERGLOW`, `WS2812_STRIP default y`.
- **SPI3** is on every supported controller (all are nRF52840), shares hardware with no I2C unit, and isn't used by the shift registers (`&spi2`), the nice!view adapter (`&spi0`), `pro_micro_spi` (`&spi1`/`&spi0`) or `xiao_spi` (`&spi2`). So underglow always goes on `&spi3`.
- **Backlight:** a `pwm-leds` node driven by `&pwm0` channel 0 (`NRF_PSEL(PWM_OUT0, port, pin)` in pinctrl default and sleep states), with `chosen { zmk,backlight = &backlight; }`, as in ZMK's backlight docs. `pwm0` isn't used by any supported board. The builder confirms which Kconfig symbols the shield must default on (`PWM`, `LED_PWM`) by building the fixtures.
- **Power pin:** ZMK has one external power device, the `zmk,ext-power-generic` node at `/EXT_POWER`. ZMK only uses the first instance, so a second one can't be added. The v2 shield therefore retargets it:
  - `&{/EXT_POWER} { control-gpios = <&pro_micro 5 GPIO_ACTIVE_HIGH>; };`
  - It then holds the board's own switchable 3.3 V pin on with a `gpio-hog` (P0.13 on the nice!nano), because that pin powers the shift registers and the nice!view.

  `ZMK_RGB_UNDERGLOW_EXT_POWER` (default y in ZMK) then cuts the LEDs' power with them.

## Model

`types.ts` (the builder may adjust names to match the code):

```ts
/** A half's LEDs. */
export interface Leds {
  /** Addressable RGB LEDs (WS2812/SK6812) in one chain. */
  underglow?: { data: Pin; count: number };
  /** Single-colour LEDs dimmed together. */
  backlight?: { pin: Pin };
  /** Switches the LEDs' power (a load switch or MOSFET, active high). */
  power?: Pin;
}

interface KeyboardHardware {
  /** LEDs on the left half (or the only half). */
  leds?: Leds;
  /** The right half's own LEDs; without them the right half copies the left's. */
  rightLeds?: Leds;
}
```

This follows the encoders' pattern (`encoders` / `rightEncoders`). Ticking "The right half is wired differently" copies `leds` into `rightLeds`; unticking removes it, like `rightEncoders`.

## Wizard

- **Wiring step, per half (after Encoders):** an "LEDs" fieldset with:
  - "RGB underglow" switch → `LED data` pin card + "Number of LEDs" (1–256).
  - "Backlight" switch → `Backlight` pin card.
  - When either is on: `LED power (optional)` pin card ("No pin" = no power switch), and one muted sentence on what it does.
- **On a mirrored split:** a note on the left half, "The right half gets the same LEDs", as encoders have.
- **Pin cards and picking:** these are ordinary pin cards, so field-first, pin-first, auto-advance and empty-click deselect all work. New `PinList` entries: `led.data`, `led.backlight`, `led.power`.
- **Pin uses / pinout:** "LED data", "Backlight", "LED power". A new pad colour class (`use-led`) next to the others, with matching hole colours.
- **Review step:** a line such as "20 RGB LEDs on D4, power switch on D5" (per half on a split).

## Validation (`validateHardware`, area `wiring`, level `error`)

- LED pins join the labelled pin list per half (missing a pin, not a controller pin, used twice), like display pins.
- "Number of LEDs" must be a whole number from 1 to 256.
- Messages are plain and say what to do, e.g. "LED data has no pin. Pick the pin the first LED's DIN is wired to."

## Generated shield

- **One-piece:** the nodes go in the root overlay after the display and shift register sections.
- **Split:** each half's overlay gets its own half's LEDs (the left's when mirrored), the same way display nodes are written per half today.
- **Underglow:** `&pinctrl` states `led_spi_default` / `led_spi_sleep` (MOSI only) and an `&spi3` block with the `led_strip: ws2812@0` child as above, plus the `chosen` entry.
- **Backlight:** `&pinctrl` states for `pwm0`, an `&pwm0` block, a `backlight: pwmleds { compatible = "pwm-leds"; pwm_led_0 { pwms = <&pwm0 0 PWM_MSEC(10) PWM_POLARITY_NORMAL>; }; }` node, and the `chosen` entry.
- **Power pin:** retarget `&{/EXT_POWER}`'s `control-gpios` to the pin.
  - **Board has its own switchable 3.3 V pin:** add the `gpio-hog` that keeps it on. The builder looks up, for every controller in `HARDWARE_CONTROLLERS`, whether the ZMK v0.3 board has an `EXT_POWER` node and which GPIO it uses, and records that in the controller or interconnect data.
  - **Board has no `EXT_POWER` node** (e.g. the XIAO): create one (`compatible = "zmk,ext-power-generic"`, `control-gpios = <…>`). Enable `ZMK_EXT_POWER` if needed.
- **Underglow without a power pin on a keyboard with shift registers:** `Kconfig.defconfig` sets `ZMK_RGB_UNDERGLOW_EXT_POWER default n`. Otherwise turning the LEDs off would switch off the board's 3.3 V pin, which powers the shift registers, and the keys would stop working. Without shift registers, ZMK's default stays (the LEDs are often powered from that pin).
- **`Kconfig.defconfig`:**
  - `SPI default y` (once, shared with shift registers);
  - inside `if ZMK_RGB_UNDERGLOW`: `WS2812_STRIP default y`;
  - for backlight: whatever the fixtures prove is needed.
- **Unchanged:** keyboards without LEDs generate byte-identical files.

## File format

`leds` and `rightLeds` are written after `shiftRegisters` (or where it would be), in field order `underglow` (`data`, `count`), `backlight` (`pin`), `power`. Following the lowest-version rule:
- **Version 4** is written only when LEDs are present.
- **Otherwise unchanged:** keyboards without LEDs keep versions 1–3 exactly as today.
- **Older editors:** they report "update the editor".

## Settings

- `lacksHardwareFor` returns false for `ZMK_RGB_UNDERGLOW` when the hardware has underglow on any half, and for `ZMK_BACKLIGHT` when it has backlight.
- **New keyboard:** `newHardwareConfig` writes `CONFIG_ZMK_RGB_UNDERGLOW=y` / `CONFIG_ZMK_BACKLIGHT=y` when the keyboard has them.
- **Editing a keyboard:** `applyHardware` writes the matching setting when the edit adds a kind that wasn't there before, and adds a note to its notice. It never switches a setting off on its own. If an edit removes the hardware while the setting is on, the existing "is on, but … has no LED strip yet" warning appears. (My call.)

## Help and README

- **Help, "Designing your own keyboard":** a short "LEDs" paragraph:
  - underglow means any chain of addressable LEDs, wherever they sit;
  - backlight is single-colour from one pin;
  - what the power pin does;
  - that the LED keys are in the palette.
- **README feature list:** add LEDs to the "your own keyboard" item.

## Testing

- **Unit tests:** model helpers (mirroring, copy on "wired differently"), definition round-trip as version 4 with older versions unchanged, each validation message, generated nodes for underglow, backlight and power (one-piece and split), `Kconfig.defconfig` lines, and Settings unlock and auto-on.
- **Golden test:** the Subsata v2 described with shift registers, a nice!view, an encoder and 20 LEDs on D4 with power on D5. The generated LED nodes match the hand-written shield: `&spi3`, MOSI P0.22, chain length 20, the frames and colour mapping, `EXT_POWER` on D5, and the P0.13 hog.
- **UI tests:** the LEDs fieldset, pin picking into the LED cards, the mirrored split note, and the review line.
- **Firmware build fixtures** (`test/generated/`, built by `firmware.yml`):
  - `editor_leds` (one-piece, underglow + power, next to shift registers and a nice!view, like the v2);
  - `editor_leds_split` (split, underglow on both halves, backlight, power);
  - `editor_leds_xiao` (XIAO, underglow + power, so a new `EXT_POWER` node is created).

## Left to the builder

- Exact component structure and CSS of the LEDs fieldset, within the editor's existing style (pin cards, switches).
- Kconfig details for backlight, settled by the CI builds.
- Whether ZMK v0.3 syncs the backlight state to the right half of a split, as it does for underglow. If it doesn't, the help text says so.
- The per-board 3.3 V control pin table, from the ZMK v0.3 board files.
- Names of helpers and test files.
