# Custom keyboards, Stage 3 (displays): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keyboards designed in the editor can have a nice!view, a 128×32 OLED or a 128×64 OLED on each half. The pins are reserved, the firmware is set up the way ZMK's own keyboards do it, and the display is on without touching Settings.

**Architecture:**
- `KeyboardHardware` gets an optional `displays: { left?, right? }`. A one-piece keyboard uses `left`.
- **nice!view:** adds ZMK's `nice_view_adapter nice_view` shields to that half's `build.yaml` target.
- **OLED:** adds, in that half's overlay (or the one-piece overlay), the SSD1306 node on `&pro_micro_i2c`, the `zephyr,display` chosen node, the Corne/Kyria display Kconfig, and a per-shield `.conf` with `CONFIG_ZMK_DISPLAY=y`.
- Display pins take part in pin validation and the pinout, like any other pin.

**Tech Stack:** TypeScript (strict), React 19, Vitest, Testing Library, and CI with `zmkfirmware/zmk-build-arm:stable`.

**Spec:** [docs/specs/2026-09-27-custom-keyboards-design.md](../specs/2026-09-27-custom-keyboards-design.md), "Stages" item 3 (the displays part). Design details agreed in chat on 2026-09-28:
- per-half choice of none / nice!view / OLED 128×32 / OLED 128×64;
- standard pins only;
- the display is on by default.

## Global Constraints

Verified against `zmkfirmware/zmk` at `v0.3` on 2026-09-28:

- **nice!view:**
  - `nice_view_adapter/boards/nice_nano_v2.overlay` drives the screen over SPI with SCK = P0.20 (D3), MOSI = P0.17 (D2), and `cs-gpios = <&pro_micro 1 …>` (D1). It also disables `&pro_micro_i2c`.
  - The adapter has overlays for every controller the wizard offers: bluemicro840_v1, mikoto, nice_nano, nice_nano_v2, nrfmicro_11, nrfmicro_11_flipped, nrfmicro_13 and puchi_ble_v1.
  - `nice_view.conf` sets `CONFIG_ZMK_DISPLAY=y`, and `nice_view` sets `zephyr,display` itself. So a half with a nice!view needs only `nice_view_adapter nice_view` after its shield in `build.yaml`; the Lily58 CI fixture already builds exactly that.
- **OLED 128×32:** use the Corne's node (`corne/corne.dtsi`), on `&pro_micro_i2c`, the nice!nano's I2C: SDA = P0.17 (D2), SCL = P0.20 (D3):

  ```
  oled: ssd1306@3c {
      compatible = "solomon,ssd1306fb";
      reg = <0x3c>; width = <128>; height = <32>;
      segment-offset = <0>; page-offset = <0>; display-offset = <0>;
      multiplex-ratio = <31>; segment-remap; com-invdir; com-sequential; inversion-on; prechargep = <0x22>;
  };
  ```

- **OLED 128×64:** use the Kyria's node (`kyria/kyria_common.dtsi`): `width = <128>; height = <64>`, the same offsets, `multiplex-ratio = <63>; prechargep = <0x22>; inversion-on;`.
- **OLED Kconfig:** the Corne and the Kyria use the identical `Kconfig.defconfig` block: `if ZMK_DISPLAY` → `I2C`, `SSD1306` default y; `if LVGL` → `LV_Z_VDB_SIZE 64`, `LV_DPI_DEF 148`, `LV_Z_BITS_PER_PIXEL 1`, `choice LV_COLOR_DEPTH` default `LV_COLOR_DEPTH_1`.
- **Turning the display on:** shields ship per-shield `.conf` files (`corne_left.conf`, `kyria_left.conf`, `nice_view.conf`), and Zephyr applies `<shield>.conf` from the shield folder. The user's `config/<name>.conf` is applied after it, so the Settings tab can still switch the display off.
- **Pins:** nice!view uses D1, D2, D3; the OLEDs use D2 and D3. They take part in the same per-half duplicate check as rows, columns, inputs and encoders.
- **Keyboards without displays** generate byte-identical files. The existing exact-string and snapshot tests pin this.
- **Repo conventions:**
  - `src/core` has no React;
  - tests come first;
  - no non-null assertions;
  - form fields use `<label htmlFor>` plus `aria-describedby`;
  - commits get a why-body and the trailer your harness names.

## Review Focus

1. **A mirrored split (the right half has no own pins) with a display on the right only:** the right half's display pins must still be checked against the mirrored matrix (Task 1 test).
2. **Changing or removing a display in "Edit hardware"** must update the build targets. A nice!view Gem that replaced `nice_view` must survive when the display stays a nice!view, and be removed when it doesn't (Task 3 test).
3. **`CONFIG_ZMK_DISPLAY=n` written earlier by Settings** (the user's own `zmk-test` repo has it) would override the per-shield `.conf`. Settings must warn with a "Turn on" fix for keyboards with a display (Task 3 test).
4. **A split whose left half has an OLED and whose right half has none:** the Kconfig and `.conf` must apply to the left shield only, and the right build must not reference `&oled` (Task 2 test).
5. **Real ZMK builds of all three display kinds:** CI fixtures with a nice!view on both halves, a 128×64 on a one-piece keyboard, and a 128×32 on the left half only (Task 5).

---

## File structure

- **Create:** `src/core/hardware/displays.ts`, the display catalogue and helpers, plus `src/core/hardware/displays.test.ts`.
- **Modify:**
  - `src/core/hardware/types.ts`: `DisplayKind`, `KeyboardHardware.displays`.
  - `src/core/hardware/wiring.ts`: `pinUses` lists display pins.
  - `src/core/hardware/validate.ts`: display pins in the per-half check.
  - `src/core/hardware/definition.ts`: serialize and parse `displays`.
  - `src/core/hardware/generate.ts`: OLED nodes, the Kconfig block, per-shield `.conf`.
  - `src/core/hardware/config.ts`: build targets with nice!view shields.
  - `src/core/catalog/settings.ts`: display availability and the default-on warning.
  - `src/ui/components/HardwareWiringStep.tsx`: the Displays fieldset.
  - `test/customKeyboards.test.ts` and the `test/generated/editor_*` snapshots.
  - `README.md`.

---

### Task 1: The display model, pins and validation

**Files:**
- Create: `src/core/hardware/displays.ts`, `src/core/hardware/displays.test.ts`
- Modify: `src/core/hardware/types.ts`, `src/core/hardware/wiring.ts`, `src/core/hardware/validate.ts`, `src/core/hardware/definition.ts`
- Test: `src/core/hardware/displays.test.ts`, `src/core/hardware/validate.test.ts`, `src/core/hardware/definition.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `DisplayKind = 'nice_view' | 'oled_128x32' | 'oled_128x64'`; `KeyboardHardware.displays?: { left?: DisplayKind; right?: DisplayKind }`.
  - `displays.ts`:
    - `DISPLAYS: Record<DisplayKind, { label: string; pins: { pin: number; use: string }[] }>`;
    - `halfDisplay(hw, side?): DisplayKind | undefined`;
    - `setDisplay(hw, side, kind | undefined): KeyboardHardware`;
    - `hasDisplay(hw): boolean`.
  - `pinUses` adds the display uses, e.g. 2 → `Display SDA`.
  - `validateHardware` checks display pins with the same messages as other pins.

- [ ] **Step 1: Write the failing tests.** Create `src/core/hardware/displays.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DISPLAYS, halfDisplay, hasDisplay, setDisplay } from './displays.ts';
import { testPad, testSplit } from './testFixtures.ts';
import { pinUses } from './wiring.ts';

describe('displays', () => {
  it('uses the standard pins: nice!view D1/D2/D3, OLEDs D2/D3', () => {
    expect(DISPLAYS.nice_view.pins.map((p) => p.pin)).toEqual([1, 2, 3]);
    expect(DISPLAYS.oled_128x32.pins).toEqual([{ pin: 2, use: 'Display SDA' }, { pin: 3, use: 'Display SCL' }]);
    expect(DISPLAYS.oled_128x64.pins.map((p) => p.pin)).toEqual([2, 3]);
  });

  it('sets a display per half; a one-piece keyboard uses the left slot', () => {
    const split = setDisplay(setDisplay(testSplit, 'left', 'nice_view'), 'right', 'oled_128x32');
    expect(halfDisplay(split, 'left')).toBe('nice_view');
    expect(halfDisplay(split, 'right')).toBe('oled_128x32');
    expect(hasDisplay(split)).toBe(true);
    const pad = setDisplay(testPad, undefined, 'oled_128x64');
    expect(halfDisplay(pad)).toBe('oled_128x64');
    // Removing the last display removes the field, so files without displays don't change.
    expect(setDisplay(pad, undefined, undefined)).not.toHaveProperty('displays');
    expect(hasDisplay(testPad)).toBe(false);
  });

  it('lists display pins among the pin uses of their half', () => {
    const split = setDisplay(testSplit, 'right', 'nice_view');
    expect(pinUses(split, 'right').get(1)).toEqual(['Display CS']);
    expect(pinUses(split, 'left').get(1)).toBeUndefined();
  });
});
```

Append inside `describe('validateHardware', …)` in `validate.test.ts` (import `setDisplay` from `./displays.ts`):

```ts
  it('checks display pins against the other pins of their half', () => {
    const hw = wired(); // rows [4, 5], cols [6, 7, 8]
    expect(messages(setDisplay(hw, 'left', 'oled_128x32'))).toEqual([]);
    const clash = { ...hw, encoders: [{ a: 2, b: 9 }] };
    expect(messages(setDisplay(clash, 'left', 'oled_128x32'))).toEqual(['D2 is used for both Encoder 0 A and Display SDA on the left half.']);
    // A mirrored right half is still checked when it has a display of its own.
    const rightOnly = { ...hw, wiring: { kind: 'matrix' as const, diodeDirection: 'col2row' as const, rows: [1, 5], cols: [6, 7, 8] } };
    expect(messages(setDisplay(rightOnly, 'right', 'nice_view'))).toEqual(['D1 is used for both Row 0 and Display CS on the right half.']);
  });
```

Append to `definition.test.ts`:

```ts
describe('hardware definition with displays', () => {
  it('round-trips displays and leaves them out when there are none', () => {
    const withDisplays = { ...hw, displays: { left: 'nice_view' as const, right: 'oled_128x64' as const } };
    expect(parseHardware(serializeHardware(withDisplays))).toEqual(withDisplays);
    expect(serializeHardware(hw)).not.toContain('displays');
    expect(() => parseHardware(serializeHardware(withDisplays).replace('"oled_128x64"', '"crt"'))).toThrow('displays.right must be one of nice_view, oled_128x32, oled_128x64');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail.**
Run: `npx vitest run src/core/hardware`
Expected: FAIL, because `./displays.ts` can't be resolved.

- [ ] **Step 3: Implement.**

`types.ts`: add this above `KeyboardHardware`:

```ts
/** A screen on one half: a nice!view (via ZMK's adapter) or an SSD1306 OLED on the Pro Micro's I2C pins. */
export type DisplayKind = 'nice_view' | 'oled_128x32' | 'oled_128x64';
```

Add this to `KeyboardHardware`, after `rightEncoders`:

```ts
  /** A display per half; a one-piece keyboard uses `left`. */
  displays?: { left?: DisplayKind; right?: DisplayKind };
```

`displays.ts`:

```ts
import type { DisplayKind, KeyboardHardware, Side } from './types.ts';

/**
 * The displays the wizard offers, on their standard pins (ZMK v0.3): the
 * nice!view adapter uses D2 (MOSI), D3 (SCK) and D1 (CS); an SSD1306 OLED sits
 * on the Pro Micro's I2C pins, D2 (SDA) and D3 (SCL).
 */
export const DISPLAYS: Record<DisplayKind, { label: string; pins: { pin: number; use: string }[] }> = {
  nice_view: {
    label: 'nice!view',
    pins: [
      { pin: 1, use: 'Display CS' },
      { pin: 2, use: 'Display data' },
      { pin: 3, use: 'Display clock' },
    ],
  },
  oled_128x32: { label: 'OLED 128×32 (0.91″)', pins: [{ pin: 2, use: 'Display SDA' }, { pin: 3, use: 'Display SCL' }] },
  oled_128x64: { label: 'OLED 128×64 (0.96″)', pins: [{ pin: 2, use: 'Display SDA' }, { pin: 3, use: 'Display SCL' }] },
};

export const DISPLAY_KINDS = Object.keys(DISPLAYS) as DisplayKind[];

export function halfDisplay(hw: KeyboardHardware, side?: Side): DisplayKind | undefined {
  return side === 'right' ? hw.displays?.right : hw.displays?.left;
}

export function hasDisplay(hw: KeyboardHardware): boolean {
  return halfDisplay(hw, 'left') !== undefined || (hw.split && halfDisplay(hw, 'right') !== undefined);
}

/** Sets (or with undefined, removes) a half's display; a one-piece keyboard uses the left slot. */
export function setDisplay(hw: KeyboardHardware, side: Side | undefined, kind: DisplayKind | undefined): KeyboardHardware {
  const key = side === 'right' ? 'right' : 'left';
  const displays = { ...hw.displays };
  if (kind) displays[key] = kind;
  else delete displays[key];
  const next = { ...hw };
  if (displays.left || displays.right) next.displays = displays;
  else delete next.displays;
  return next;
}
```

`wiring.ts`:
- Import `DISPLAYS` and `halfDisplay` from `./displays.ts`. `displays.ts` imports only types, so there's no cycle.
- At the end of `pinUses`, before `return uses`, add:

```ts
  const display = halfDisplay(hw, side);
  if (display) for (const { pin, use } of DISPLAYS[display].pins) add(pin, use);
```

`validate.ts`:
- Import `DISPLAYS` and `halfDisplay`.
- Change the check-once condition to `if (side !== 'right' || hw.wiring.right || hw.rightEncoders || halfDisplay(hw, 'right')) {`.
- Inside the `for (const side of halves(hw))` loop, before `labelled`, add `const display = halfDisplay(hw, side);`. Then append the display pins to `labelled`, after the encoders:

```ts
        ...(display ? DISPLAYS[display].pins.map(({ pin, use }) => ({ label: use, pin })) : []),
```

`definition.ts`:
- Import the `DisplayKind` type and `DISPLAY_KINDS` from `./displays.ts`.
- In `serializeHardware`, after the encoder spreads, add:

```ts
      ...(hw.displays ? { displays: { ...(hw.displays.left ? { left: hw.displays.left } : {}), ...(hw.displays.right ? { right: hw.displays.right } : {}) } } : {}),
```

- In `parseHardware`, before `return hardware`:

```ts
  if (data.displays !== undefined) {
    if (!isRecord(data.displays)) throw new Error('displays must be an object');
    const kind = (value: unknown, what: string): DisplayKind => {
      if (typeof value !== 'string' || !(DISPLAY_KINDS as string[]).includes(value)) throw new Error(`${what} must be one of ${DISPLAY_KINDS.join(', ')}`);
      return value as DisplayKind;
    };
    const displays: { left?: DisplayKind; right?: DisplayKind } = {};
    if (data.displays.left !== undefined) displays.left = kind(data.displays.left, 'displays.left');
    if (data.displays.right !== undefined) displays.right = kind(data.displays.right, 'displays.right');
    hardware.displays = displays;
  }
```

- [ ] **Step 4: Run the tests.**
Run: `npx vitest run src/core/hardware test/customKeyboards.test.ts`
Expected: PASS, with no snapshot changes.

- [ ] **Step 5: Commit** with the message "Model displays on designed keyboards and reserve their pins".

---

### Task 2: Generate the OLED devicetree, Kconfig and `.conf`

**Files:**
- Modify: `src/core/hardware/generate.ts`
- Test: `src/core/hardware/generate.test.ts`

**Interfaces:**
- Consumes: `halfDisplay`, `setDisplay` (Task 1).
- Produces:
  - `generateShield` writes the OLED nodes into the half overlay (or the one-piece overlay).
  - It appends a Kconfig block `if <OLED shields>` with the Corne/Kyria display settings.
  - It writes `config/boards/shields/<name>/<shield>.conf` containing `CONFIG_ZMK_DISPLAY=y` for each OLED shield.
  - The nice!view produces no shield-file changes; it lives in `build.yaml` (Task 3).

- [ ] **Step 1: Write the failing tests.** Append to `generate.test.ts` (import `setDisplay` from `./displays.ts`):

```ts
describe('generateShield: displays', () => {
  const oledNode32 = `&pro_micro_i2c {
    status = "okay";

    oled: ssd1306@3c {
        compatible = "solomon,ssd1306fb";
        reg = <0x3c>;
        width = <128>;
        height = <32>;
        segment-offset = <0>;
        page-offset = <0>;
        display-offset = <0>;
        multiplex-ratio = <31>;
        segment-remap;
        com-invdir;
        com-sequential;
        inversion-on;
        prechargep = <0x22>;
    };
};

/ {
    chosen {
        zephyr,display = &oled;
    };
};`;

  const displayKconfig = (condition: string) => `if ${condition}

if ZMK_DISPLAY

config I2C
    default y

config SSD1306
    default y

endif # ZMK_DISPLAY

if LVGL

config LV_Z_VDB_SIZE
    default 64

config LV_DPI_DEF
    default 148

config LV_Z_BITS_PER_PIXEL
    default 1

choice LV_COLOR_DEPTH
    default LV_COLOR_DEPTH_1
endchoice

endif # LVGL

endif
`;

  it('puts a left-only 128×32 OLED in the left overlay, with its Kconfig and .conf for the left shield only', () => {
    const files = generateShield(setDisplay(testSplit, 'left', 'oled_128x32'));
    expect(files[`${dir('test_split')}/test_split_left.overlay`]).toContain(oledNode32);
    expect(files[`${dir('test_split')}/test_split_right.overlay`]).not.toContain('oled');
    expect(files[`${dir('test_split')}/test_split.dtsi`]).not.toContain('oled');
    expect(files[`${dir('test_split')}/Kconfig.defconfig`]).toContain(`\n${displayKconfig('SHIELD_TEST_SPLIT_LEFT')}`);
    expect(files[`${dir('test_split')}/test_split_left.conf`]).toBe('# Generated by ZMK Editor from test_split.editor.json.\nCONFIG_ZMK_DISPLAY=y\n');
    expect(files[`${dir('test_split')}/test_split_right.conf`]).toBeUndefined();
  });

  it('uses the Kyria’s node for a 128×64 OLED on a one-piece keyboard', () => {
    const files = generateShield(setDisplay(testPad, undefined, 'oled_128x64'));
    const overlay = files[`${dir('test_pad')}/test_pad.overlay`] ?? '';
    expect(overlay).toContain(`        width = <128>;
        height = <64>;
        segment-offset = <0>;
        page-offset = <0>;
        display-offset = <0>;
        multiplex-ratio = <63>;
        prechargep = <0x22>;
        inversion-on;
    };`);
    expect(overlay.trimEnd().endsWith('zephyr,display = &oled;\n    };\n};')).toBe(true);
    expect(files[`${dir('test_pad')}/Kconfig.defconfig`]).toContain(displayKconfig('SHIELD_TEST_PAD'));
    expect(files[`${dir('test_pad')}/test_pad.conf`]).toContain('CONFIG_ZMK_DISPLAY=y');
  });

  it('writes nothing extra for a nice!view (it comes from ZMK’s own shields in build.yaml)', () => {
    expect(generateShield(setDisplay(testSplit, 'left', 'nice_view'))).toEqual(generateShield(testSplit));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail.**
Run: `npx vitest run src/core/hardware/generate.test.ts`
Expected: FAIL: the first two tests (no OLED output yet). The nice!view test already passes and stays as a guard.

- [ ] **Step 3: Implement in `generate.ts`.** Import `halfDisplay`, and the `DisplayKind` type from `./types.ts`.

```ts
/** OLED nodes as in ZMK's Corne (128×32) and Kyria (128×64), on the Pro Micro's I2C, plus the chosen display. */
function oledNodes(kind: DisplayKind): string {
  const size =
    kind === 'oled_128x32'
      ? ['        width = <128>;', '        height = <32>;', '        segment-offset = <0>;', '        page-offset = <0>;', '        display-offset = <0>;', '        multiplex-ratio = <31>;', '        segment-remap;', '        com-invdir;', '        com-sequential;', '        inversion-on;', '        prechargep = <0x22>;']
      : ['        width = <128>;', '        height = <64>;', '        segment-offset = <0>;', '        page-offset = <0>;', '        display-offset = <0>;', '        multiplex-ratio = <63>;', '        prechargep = <0x22>;', '        inversion-on;'];
  return [
    '&pro_micro_i2c {',
    '    status = "okay";',
    '',
    '    oled: ssd1306@3c {',
    '        compatible = "solomon,ssd1306fb";',
    '        reg = <0x3c>;',
    ...size,
    '    };',
    '};',
    '',
    '/ {',
    '    chosen {',
    '        zephyr,display = &oled;',
    '    };',
    '};',
  ].join('\n');
}

const isOled = (kind: DisplayKind | undefined): kind is DisplayKind => kind === 'oled_128x32' || kind === 'oled_128x64';

/** The shields (with their half) whose half has an OLED. */
function oledShields(hw: KeyboardHardware): { shield: string; symbol: string }[] {
  const all = shields(hw);
  const sides: (Side | undefined)[] = hw.split ? ['left', 'right'] : [undefined];
  return all.filter((_, i) => isOled(halfDisplay(hw, sides[i])));
}

// Display settings as in ZMK's Corne and Kyria Kconfig.defconfig (identical in both).
const DISPLAY_KCONFIG = `if ZMK_DISPLAY

config I2C
    default y

config SSD1306
    default y

endif # ZMK_DISPLAY

if LVGL

config LV_Z_VDB_SIZE
    default 64

config LV_DPI_DEF
    default 148

config LV_Z_BITS_PER_PIXEL
    default 1

choice LV_COLOR_DEPTH
    default LV_COLOR_DEPTH_1
endchoice

endif # LVGL
`;
```

- In `kconfigDefconfig`, compute `const oled = oledShields(hw);`. Just before each `return`, when `oled.length > 0`, append `` `\nif ${oled.map((s) => s.symbol).join(' || ')}\n\n${DISPLAY_KCONFIG}\nendif\n` `` to the returned text. Wrap the existing return expressions in a `const text = …;` first, then `return oled.length > 0 ? text + block : text;`.
- In `rootFile(hw, withPins)`: for a one-piece keyboard (`withPins`) with an OLED, append `\n${oledNodes(kind)}\n` after the closing `};\n` of the root block. Pass `withPins && isOled(halfDisplay(hw))`.
- In `halfOverlay(hw, side)`: if `isOled(halfDisplay(hw, side))`, push `oledNodes(kind)` as the last part.
- In `generateShield`, after building `files`, add:

```ts
  for (const { shield } of oledShields(hw)) files[`${dir}/${shield}.conf`] = `# ${note(hw)}\nCONFIG_ZMK_DISPLAY=y\n`;
```

- [ ] **Step 4: Run the tests.**
Run: `npx vitest run src/core/hardware test/customKeyboards.test.ts`
Expected: PASS, with the snapshots unchanged (no fixture has a display yet).

- [ ] **Step 5: Commit** with the message "Generate OLED displays the way ZMK's Corne and Kyria define them".

---

### Task 3: Build targets and Settings

**Files:**
- Modify: `src/core/hardware/config.ts`, `src/core/catalog/settings.ts`
- Test: `src/core/hardware/config.test.ts`, `src/core/catalog/settings.test.ts`

**Interfaces:**
- Consumes: `halfDisplay`, `hasDisplay`, `setDisplay` (Task 1).
- Produces:
  - `hardwareBuildTargets(hw)` adds `nice_view_adapter nice_view` to the shield of a half with a nice!view.
  - `applyHardware` updates the display shields of existing targets, and keeps a `nice_view_gem` that replaced `nice_view` while the display stays a nice!view.
  - Settings treats the display as available for keyboards with a display, and warns when `CONFIG_ZMK_DISPLAY=n` is written explicitly.

- [ ] **Step 1: Write the failing tests.**

Append inside the describe in `config.test.ts` (import `setDisplay` from `./displays.ts`):

```ts
  it('adds the nice!view shields to the halves that have one, and follows later display changes', () => {
    const viewLeft = setDisplay(testSplit, 'left', 'nice_view');
    const start = newHardwareConfig(viewLeft, 'v0.3');
    expect(start.build.include.map((t) => t.shield)).toEqual(['test_split_left nice_view_adapter nice_view', 'test_split_right']);
    // A nice!view Gem (module) replacing nice_view is kept while the display stays a nice!view…
    const gem = { ...start, build: { include: start.build.include.map((t, i) => (i === 0 ? { ...t, shield: 'test_split_left nice_view_adapter nice_view_gem' } : t)) } };
    const both = setDisplay(viewLeft, 'right', 'nice_view');
    expect(applyHardware(gem, both, testSplit.keys.map((_, i) => i)).config.build.include.map((t) => t.shield)).toEqual([
      'test_split_left nice_view_adapter nice_view_gem',
      'test_split_right nice_view_adapter nice_view',
    ]);
    // …and removed with it.
    const oled = setDisplay(setDisplay(testSplit, 'left', 'oled_128x32'), 'right', undefined);
    expect(applyHardware(gem, oled, testSplit.keys.map((_, i) => i)).config.build.include.map((t) => t.shield)).toEqual(['test_split_left', 'test_split_right']);
  });
```

Append inside `describe('settings a designed keyboard has no hardware for', …)` in `settings.test.ts` (import `setDisplay` from `../hardware/displays.ts`):

```ts
  it('treats the display as available and on for a keyboard with a screen', () => {
    const withScreen = newHardwareConfig(setDisplay(testSplit, 'left', 'oled_128x32'), 'v0.3');
    const def = findSetting('ZMK_DISPLAY');
    if (!def) throw new Error('setting');
    expect(unsupportedHardwareSettings({ ...withScreen, kconfig: writeSetting(withScreen.kconfig, def, true) })).toEqual([]);
    expect(settingWarnings(withScreen).some((w) => w.fix?.name === 'ZMK_DISPLAY')).toBe(false);
    // An explicit "off" (e.g. written by Settings earlier) overrides the shield's own setting: offer to turn it on.
    const off = { ...withScreen, kconfig: writeSetting(withScreen.kconfig, def, false) };
    expect(settingWarnings(off)).toContainEqual({
      message: 'Test Split has a screen, but Display is off in Settings, so it stays dark.',
      fix: { name: 'ZMK_DISPLAY', value: true },
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail.**
Run: `npx vitest run src/core/hardware/config.test.ts src/core/catalog/settings.test.ts`
Expected: FAIL. The build targets have no nice!view shields yet, and the display counts as unsupported.

- [ ] **Step 3: Implement.**

`config.ts` (import `halfDisplay` from `./displays.ts`, and the `Side` type):

```ts
/** Shields ZMK and modules use for a nice!view; `nice_view_gem` (a module) takes the place of `nice_view`. */
const NICE_VIEW_SHIELDS = ['nice_view_adapter', 'nice_view', 'nice_view_gem'];

/** A target's shield list with the half's nice!view shields added or removed; other extras are kept. */
function withDisplayShields(shield: string, niceView: boolean): string {
  const [base = '', ...rest] = shield.split(' ').filter(Boolean);
  const others = rest.filter((s) => !NICE_VIEW_SHIELDS.includes(s));
  const view = niceView ? ['nice_view_adapter', rest.includes('nice_view_gem') ? 'nice_view_gem' : 'nice_view'] : [];
  return [base, ...view, ...others].join(' ');
}

const sideOf = (hw: KeyboardHardware, shield: string): Side | undefined => (hw.split ? (shield.endsWith('_right') ? 'right' : 'left') : undefined);
```

- `hardwareBuildTargets` becomes:

```ts
  return shieldNames(hw).map((shield) => ({ board: hw.controller, shield: withDisplayShields(shield, halfDisplay(hw, sideOf(hw, shield)) === 'nice_view') }));
```

- In `applyHardware`, change the `include` map to:

```ts
  const include = config.build.include.map((t) => {
    const base = t.shield?.split(' ')[0] ?? '';
    if (!shields.has(base)) return t;
    return { ...t, board: hw.controller, shield: withDisplayShields(t.shield ?? base, halfDisplay(hw, sideOf(hw, base)) === 'nice_view') };
  });
```

`settings.ts` (import `hasDisplay` from `../hardware/displays.ts`):
- In `lacksHardwareFor`, replace the last line with `return name !== 'ZMK_DISPLAY' || !(hasDisplayShield(config) || hasDisplay(config.hardware));`.
- In `settingWarnings`, extend the `value` helper so an unset `ZMK_DISPLAY` counts as on for designed keyboards with a display: `if (set === undefined && name === 'ZMK_DISPLAY' && config.hardware && hasDisplay(config.hardware)) return true;`.
- Add this warning after the existing ones:

```ts
  if (config.hardware && hasDisplay(config.hardware) && value('ZMK_DISPLAY') === false) {
    warnings.push({ message: `${config.hardware.displayName} has a screen, but Display is off in Settings, so it stays dark.`, fix: { name: 'ZMK_DISPLAY', value: true } });
  }
```

- [ ] **Step 4: Run the tests.**
Run: `npx vitest run src/core`
Expected: PASS.

- [ ] **Step 5: Commit** with the message "Build nice!view halves with ZMK's adapter shields and keep displays on".

---

### Task 4: Displays in the wizard

**Files:**
- Modify: `src/ui/components/HardwareWiringStep.tsx`
- Test: `src/ui/NewKeyboard.test.tsx`

**Interfaces:**
- Consumes: `DISPLAYS`, `DISPLAY_KINDS`, `halfDisplay`, `setDisplay` (Task 1).
- Produces: a **Displays** fieldset on the Wiring step:
  - selects labelled `Left display` / `Right display` (split) or `Display` (one piece);
  - options `None` and each `DISPLAYS[kind].label` followed by its pins, e.g. `nice!view (D1, D2, D3)`;
  - help text with id `hw-display-help`.

- [ ] **Step 1: Write the failing test.** Append to `src/ui/NewKeyboard.test.tsx`:

```tsx
describe('Displays in the wizard', () => {
  it('adds a nice!view to one half, reserves its pins, and builds that half with the adapter', async () => {
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config: newHardwareConfig(testSplit, 'v0.3') }));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Test Split ▾' }));
    await user.click(screen.getByRole('button', { name: 'Edit hardware' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.selectOptions(screen.getByLabelText('Left display'), 'nice_view');
    expect(screen.getByRole('button', { name: 'D1: Display CS' })).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Right display'), 'oled_128x32');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('config/boards/shields/test_split/test_split_right.overlay').textContent).toContain('ssd1306@3c');
    await user.click(screen.getByRole('button', { name: 'Save hardware' }));

    const saved = stored();
    expect(saved.hardware.displays).toEqual({ left: 'nice_view', right: 'oled_128x32' });
    expect(saved.build.include.map((t: { shield: string }) => t.shield)).toEqual(['test_split_left nice_view_adapter nice_view', 'test_split_right']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**
Run: `npx vitest run src/ui/NewKeyboard.test.tsx -t "Displays"`
Expected: FAIL: `Unable to find a label with the text of: Left display`.

- [ ] **Step 3: Implement.** In `HardwareWiringStep.tsx`, import `DISPLAYS`, `DISPLAY_KINDS`, `halfDisplay` and `setDisplay` from `../../core/hardware/displays.ts`, and the `DisplayKind` type. Render this after the `wiring-halves` div and before `<HardwareIssueList …/>`:

```tsx
      <fieldset className="fieldset">
        <legend>Displays</legend>
        <div className="pin-grid">
          {(hw.split ? (['left', 'right'] as const) : [undefined]).map((side) => {
            const id = `display-${side ?? 'one'}`;
            return (
              <div key={id} className="field">
                <label className="field-label" htmlFor={id}>
                  {side === 'left' ? 'Left display' : side === 'right' ? 'Right display' : 'Display'}
                </label>
                <select
                  id={id}
                  className="input"
                  aria-describedby="hw-display-help"
                  value={halfDisplay(hw, side) ?? ''}
                  onChange={(e) => onChange(setDisplay(hw, side, e.target.value === '' ? undefined : (e.target.value as DisplayKind)))}
                >
                  <option value="">None</option>
                  {DISPLAY_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {DISPLAYS[kind].label} ({DISPLAYS[kind].pins.map((p) => `D${p.pin}`).join(', ')})
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <p id="hw-display-help" className="muted small">
          Displays use fixed pins: a nice!view D1, D2 and D3, an OLED D2 (SDA) and D3 (SCL). They can’t be used for rows,
          columns or encoders on that half.
        </p>
      </fieldset>
```

A display change is a hardware change, so it goes through `onChange`, which already carries the encoder origins.

- [ ] **Step 4: Run the tests.**
Run: `npx vitest run src/ui && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit** with the message "Choose a display per half in the keyboard wizard".

---

### Task 5: Displays in the CI fixtures, docs and full check

**Files:**
- Modify: `test/customKeyboards.test.ts`, `test/generated/editor_*/**` (snapshots), `README.md`

- [ ] **Step 1: Give the fixtures displays**, moving pins where D1–D3 were in use. In `test/customKeyboards.test.ts`:
  - `split`: add `displays: { left: 'nice_view', right: 'nice_view' }`. D1–D3 are free; its pins are rows 4–7, columns 21/20/19/18/15/14 and encoder 8/9.
  - `numpad`:
    - change the wiring to `rows: [4, 5, 6, 7, 8], cols: [9, 10, 14, 15]`;
    - change the encoder to `encoders: [{ a: 16, b: 18 }]`;
    - add `displays: { left: 'oled_128x64' }`.
  - `duo`:
    - change the left pins to `pins: [4, 5, 6, 7, 8, 9]` (the right half keeps `[21, 20, 19, 18, 15, 14]`);
    - change the left encoder to `encoders: [{ a: 10, b: 16 }]`, keeping `rightEncoders: []`;
    - add `displays: { left: 'oled_128x32' }`.

- [ ] **Step 2: Regenerate and check.**
Run: `npx vitest run test/customKeyboards.test.ts -u`

Then check:
- `editor_split/build.yaml` lists `editor_split_left nice_view_adapter nice_view` and `editor_split_right nice_view_adapter nice_view`.
- `editor_numpad.overlay` ends with the 128×64 node and the chosen display, and `editor_numpad.conf` holds `CONFIG_ZMK_DISPLAY=y`.
- `editor_duo_left.overlay` has the 128×32 node and `editor_duo_right.overlay` has none.
- `git diff --stat -- test/generated/lily58` is empty.

- [ ] **Step 3: Docs.** In `README.md`, extend the "design your own keyboard" parenthesis with "; nice!view or OLED displays".

- [ ] **Step 4: Full check.**
Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit** with the message "Build designed keyboards with displays in CI", then push to `main-7trpb8`. Check that the **Firmware build check** passes for all seven targets. That run is the proof that the generated OLED nodes, Kconfig and `.conf` compile and that the nice!view targets resolve. If a target fails, fix `generate.ts` or `config.ts` and regenerate; don't touch the workflow.
