# Controllers beyond the Pro Micro (Seeed XIAO first): design

## Context

The keyboard wizard only offers wireless controllers with the Pro Micro footprint. Every part of it assumes that footprint:
- the pin lists (`PRO_MICRO_PINS`, `PRO_MICRO_HEADER`);
- the generated `&pro_micro N` references, `&pro_micro_i2c` and `requires: [pro_micro]`;
- the OLED and nice!view pins;
- validation messages ("isn't a Pro Micro pin");
- the pinout drawing (`ProMicroPinout.tsx`).

The Seeed Studio XIAO nRF52840 is a popular, smaller wireless controller. This change adds an **interconnect** model, so a controller's footprint decides its pins, node labels and pinout, and it adds the XIAO as the first new one. The later display-pins and visual pin planner features build on the same model (see `docs/handoff-next.md`).

Approved in chat on 2026-09-30:
- **Controllers:** offer only the XIAO nRF52840 for now. It is the only wireless XIAO-footprint board in ZMK v0.3.
- **Switching controller:** assigned pins that the new controller doesn't have are kept and flagged, not cleared.
- **nice!view on a XIAO:** not offered in this change; custom display pins come next.

## Facts from ZMK v0.3 (and ZMK's Zephyr fork, v3.5.0+zmk-fixes)

- `app/boards/interconnects/seeed_xiao/seeed_xiao.zmk.yml` has these node labels:
  - `gpio: xiao_d`
  - `i2c: xiao_i2c`
  - `spi: xiao_spi`
  - `uart: xiao_serial`
- Pins are the D-numbers, e.g. `&xiao_d 0`. ZMK's own `tester_xiao` shield uses `&xiao_d 0` … `&xiao_d 10` and `requires: [seeed_xiao]`.
- `seeeduino_xiao_ble` (the XIAO nRF52840) has `exposes: [seeed_xiao]` and outputs `usb` and `ble`. In our catalog it is the only XIAO-footprint controller with `ble: true`; the XIAO RP2040, XIAO SAMD21 and QT Py RP2040 are wired only.
- Zephyr's `boards/arm/xiao_ble/seeed_xiao_connector.dtsi` maps D0–D10 to:

  | Pad | nRF52840 pin | Pad | nRF52840 pin |
  |---|---|---|---|
  | D0 | P0.02 | D6 | P1.11 |
  | D1 | P0.03 | D7 | P1.12 |
  | D2 | P0.28 | D8 | P1.13 |
  | D3 | P0.29 | D9 | P1.14 |
  | D4 | P0.04 | D10 | P1.15 |
  | D5 | P0.05 | | |

- `xiao_i2c` is `&i2c1` on P0.04 (SDA) and P0.05 (SCL), which are D4 and D5.
- ZMK's `nice_view_adapter` shield only has board overlays for Pro Micro nRF52840 boards (nice!nano, nRFMicro, BlueMicro840, Puchi-BLE, Mikoto). It does not work on a XIAO without our own SPI setup.
- **The XIAO's header**, seen from above with USB at the top:
  - left side, top to bottom: D0, D1, D2, D3, D4, D5, D6;
  - right side, top to bottom: 5V, GND, 3V3, D10, D9, D8, D7.

## Model

`src/core/hardware/interconnects.ts`:

```ts
interface HeaderPad {
  pin: number | null;          // D-number; null for power pads
  label: string;               // "D4", "GND"
  /** The microcontroller pin behind the pad, per controller id, e.g. { seeeduino_xiao_ble: 'P0.04' }. */
  mcu?: Record<string, string>;
}

interface Interconnect {
  id: 'pro_micro' | 'seeed_xiao';  // ZMK interconnect id, written to `requires`
  name: string;                    // "Pro Micro", "Seeed XIAO"
  gpio: string;                    // node label: `&pro_micro 4`, `&xiao_d 4`
  i2c: string;                     // `pro_micro_i2c`, `xiao_i2c`
  header: { left: HeaderPad[]; right: HeaderPad[] };  // top to bottom, USB at the top
  pins: number[];                  // every GPIO pad, sorted
  i2cPins: { sda: number; scl: number };  // Pro Micro D2/D3, XIAO D4/D5
  niceViewAdapter: boolean;        // ZMK's nice!view adapter fits (Pro Micro only)
}

INTERCONNECTS: Interconnect[]
interconnectOf(controller: string): Interconnect  // from CONTROLLER_DATA `exposes`; Pro Micro if unknown
```

- **Pro Micro:** the Pro Micro entry takes over today's `PRO_MICRO_HEADER` and `PRO_MICRO_PINS`, unchanged. The nice!nano sub-labels move into `mcu` for `nice_nano` and `nice_nano_v2`, replacing `isNiceNano`.
- **Controllers:** `HARDWARE_CONTROLLERS` becomes the wireless controllers that expose a known interconnect (still excluding the `_52833` variants). That adds `seeeduino_xiao_ble`.
- **Pin labels:** `pinLabel(pin)` stays `D${pin}`. Both footprints use D-numbers.
- **No file-format change.** The interconnect follows from `KeyboardHardware.controller`, and `definition.ts` stays at `VERSION = 1`. Existing definitions load and generate exactly as before.

## Generator (`generate.ts`)

Every place that hard-codes the Pro Micro takes the interconnect from `interconnectOf(hw.controller)`:
- `kscan` GPIO lists and encoder `a-gpios`/`b-gpios` use `<&${ic.gpio} N …>`.
- The OLED node uses `&${ic.i2c} { … }`.
- `.zmk.yml` gets `requires: [${ic.id}]`.
- The nice!view path is unchanged. It is only reachable on the Pro Micro (see validation).

**Golden tests come first**, before the refactor. They snapshot every generated file of:
- a Pro Micro split with a matrix, encoders on both halves, a right half wired differently, and an OLED;
- a one-piece direct-wired Pro Micro board with a nice!view.

They must pass unchanged afterwards.

## Displays (`displays.ts`)

- `DISPLAYS[kind].pins` becomes `displayPins(kind, ic)`:
  - OLEDs use `ic.i2cPins` ("Display SDA", "Display SCL").
  - The nice!view keeps D1 (CS), D2 (data) and D3 (clock). It exists only on interconnects with `niceViewAdapter`.
- `availableDisplays(ic)` lists the kinds the wizard offers: every kind on the Pro Micro, OLEDs only on the XIAO.
- `pinUses` and validation use `displayPins`.

## Validation (`validate.ts`)

- Pin counts and "is this a pin" checks use `ic.pins`. Messages name the footprint, for example:
  - "Row 2 uses D14, which isn't a Seeed XIAO pin."
  - "A 6 × 7 matrix needs 13 pins per half, but a Seeed XIAO has 11."
- **Pins the controller doesn't have** stay in the definition and show as the error above until changed (keep and flag). Switching back to a Pro Micro makes them valid again.
- **A nice!view on a controller without the adapter** is an error: "A nice!view needs the Pro Micro adapter; on a Seeed XIAO use an OLED for now." This covers definitions edited by hand or whose controller was switched.

## Wizard UI

- **Basics:** the controller select groups controllers with `<optgroup>` by interconnect ("Pro Micro footprint", "Seeed XIAO footprint").
- **Wiring:**
  - Pin selects list `ic.pins`.
  - `ProMicroPinout.tsx` becomes `ControllerPinout.tsx`, drawn from `ic.header`. It keeps the same look, top/bottom toggle and click-to-assign behaviour, and the `mcu` sub-label for the chosen controller.
  - The figure's accessible name is "`${ic.name}` pinout", e.g. "Seeed XIAO pinout (left half)".
  - The display select offers `availableDisplays(ic)`. On a XIAO a note says that OLEDs use D4 (SDA) and D5 (SCL), and that a nice!view needs custom display pins, which aren't supported yet.
  - A nice!view already chosen stays selected, and validation flags it (keep and flag).
- **Review:** names the controller, as today.

## Testing

- **Golden tests** (above), written and passing before any refactor.
- **Core:**
  - `interconnectOf`: Pro Micro boards, the XIAO nRF52840, and unknown ids falling back to Pro Micro.
  - `HARDWARE_CONTROLLERS` includes `seeeduino_xiao_ble` and not the wired XIAOs.
  - XIAO generation: `&xiao_d N` in kscan and encoders, `&xiao_i2c` for an OLED, and `requires: [seeed_xiao]`. A one-piece direct-wired XIAO matches the shape of ZMK's `tester_xiao`.
  - XIAO validation: pins above 10 flagged, the pin-count limit at 11, a nice!view flagged, and OLED pins D4/D5 in conflicts.
  - `pinUses` on a XIAO with an OLED.
- **UI:**
  - Pick the XIAO in Basics. The Wiring step shows 11 pins in the selects and a "Seeed XIAO pinout".
  - Clicking a pad assigns it.
  - The display select has no nice!view on a XIAO.
  - Switching a Pro Micro design to a XIAO flags pins above 10.

## Out of scope

- Wired-only controllers (XIAO RP2040, XIAO SAMD21, QT Py RP2040).
- A nice!view on a XIAO, and choosing display pins: the next feature.
- The XIAO nRF52840's NFC pads as GPIOs, and its back-side pads.
- Other interconnects (BlackPill, nRF52840 M.2, Arduino Uno).
- The visual pin planner.
