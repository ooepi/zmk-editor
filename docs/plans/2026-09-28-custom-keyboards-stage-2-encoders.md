# Custom keyboards, Stage 2 (encoders): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keyboards designed in the editor can have EC11 rotary encoders on either half. The wizard picks their A/B pins, the generated shield defines them like ZMK's Sofle, and the keymap gets encoder bindings that survive later hardware edits.

**Architecture:**
- `KeyboardHardware` gets optional `encoders` (for the left half, or the only half) and `rightEncoders` (the right half's own encoders).
- Without `rightEncoders`, the right half mirrors the left's encoders with A and B swapped, the same way the Sofle does.
- The sensor order is left then right. It is the order of the `zmk,keymap-sensors` node and of every layer's `sensor-bindings`.
- The wizard tracks encoder origins, like key origins, so "Edit hardware" can remap sensor bindings.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), React 19, Vitest, Testing Library, and CI with `zmkfirmware/zmk-build-arm:stable`.

**Spec:** [docs/specs/2026-09-27-custom-keyboards-design.md](../specs/2026-09-27-custom-keyboards-design.md), section "Stages", item 2. Design details agreed in chat on 2026-09-28:
- per-half A/B pins on the Wiring step;
- a mirrored right half swaps A and B;
- the push button is an ordinary matrix key;
- the Kconfig turns encoders on;
- keymap bindings are added and remapped.

## Global Constraints

These were verified against `zmkfirmware/zmk` at `v0.3` on 2026-09-28:

- **Encoder node (the Sofle's `sofle.dtsi`):** `compatible = "alps,ec11"`; `a-gpios` and `b-gpios` with `(GPIO_ACTIVE_HIGH | GPIO_PULL_UP)`; `steps = <80>`. On splits, every encoder node sits in the shared `.dtsi` with `status = "disabled"`, and each half's overlay sets `status = "okay"` on its own encoders.
- **Mirrored right half:** the Sofle's right encoder swaps the pins (`a` = 20, `b` = 21 where the left has `a` = 21, `b` = 20).
- **Sensors node:** `sensors: sensors { compatible = "zmk,keymap-sensors"; sensors = <&… &…>; triggers-per-rotation = <20>; };`
- **Kconfig (`app/module/drivers/sensor/ec11/Kconfig`):** `EC11` is `default y` when an enabled `alps,ec11` node exists. The trigger choice `EC11_TRIGGER_MODE` defaults to `EC11_TRIGGER_NONE`. The generated `Kconfig.defconfig` must therefore set `choice EC11_TRIGGER_MODE` / `default EC11_TRIGGER_GLOBAL_THREAD` / `endchoice` whenever the keyboard has encoders. Boards with built-in encoders set `CONFIG_EC11_TRIGGER_GLOBAL_THREAD=y` in their defconfig.
- **Sensor bindings:** the Sofle keymap has one `sensor-bindings` entry per sensor, e.g. `&inc_dec_kp C_VOL_UP C_VOL_DN`. `inc_dec_kp` is built into ZMK.
- **Push button:** an encoder's click is an ordinary key in the matrix. No extra pins or kscan.
- **Keyboards without encoders:** their generated files, including `.editor.json`, stay byte-identical. The existing snapshot tests pin this.
- **Repo conventions:** `src/core` has no React. Tests come first. There are no non-null assertions. Commits get a body that explains why, plus the trailer your harness names.

## Review Focus

1. **Adding an encoder on the left of a mirrored split** adds its mirror on the right. Sensor bindings must land in left-then-right order (Task 4 test).
2. **Unticking "right half wired differently"** after giving the right half its own encoders must not misalign the remembered sensor bindings (Task 5, `carryEncoderOrigins` test).
3. **An encoder pin that clashes with a row, column or input pin** is an error, as is a missing A/B pin (Task 2 tests).
4. **`CONFIG_EC11=n` written explicitly by the Settings tab** turns the encoders off silently. Settings must warn, with a "Turn on" fix, and must not warn when the line is simply absent (Task 4 test).
5. **Generated output compiles with real ZMK:** the CI fixtures cover a mirrored split, a split whose right half has no encoders, and a one-piece keyboard (Task 6).

---

## File structure

- **Modify:**
  - `src/core/hardware/types.ts`: `Encoder`, plus fields on `KeyboardHardware`.
  - `src/core/hardware/wiring.ts`:
    - add `halfEncoders` and `setEncoderPin`;
    - add `'encoderA' | 'encoderB'` to `PinList`;
    - extend `setPin`, `setRightWiredDifferently` and `pinUses`.
  - `src/core/hardware/validate.ts`: check encoder pins.
  - `src/core/hardware/definition.ts`: serialize and parse encoders.
  - `src/core/hardware/generate.ts`: encoder nodes, sensors node, overlays, Kconfig.
  - `src/core/hardware/starter.ts`: starter sensor bindings.
  - `src/core/hardware/config.ts`: `applyHardware` remaps the sensor bindings.
  - `src/core/catalog/settings.ts`: EC11 is supported, and on by default, for keyboards with encoders.
  - UI (`src/ui/components/`): `HardwareWiringStep.tsx`, `HardwareWizard.tsx`, `HardwareLayoutStep.tsx`.
  - Tests and CI: `test/customKeyboards.test.ts` and the `test/generated/editor_*` snapshots.
  - `README.md`.
- **Create:**
  - `src/core/hardware/encoders.ts`: `sensorOrder`, `addEncoder`, `removeEncoder`, `carryEncoderOrigins`, `EncoderDraft`, `sensorLabel`.
  - `src/core/hardware/encoders.test.ts`.
- **Tests:** next to each changed file; UI tests in `src/ui/NewKeyboard.test.tsx`.

Run single test files with `npx vitest run <path>`.

---

### Task 1: The encoder model, pins and definition file

**Files:**
- Modify: `src/core/hardware/types.ts`, `src/core/hardware/wiring.ts`, `src/core/hardware/definition.ts`
- Create: `src/core/hardware/encoders.ts`
- Test: `src/core/hardware/encoders.test.ts`, `src/core/hardware/definition.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `Encoder { a: Pin; b: Pin }`, `KeyboardHardware.encoders?: Encoder[]`, `KeyboardHardware.rightEncoders?: Encoder[]`.
  - `wiring.ts`:
    - `halfEncoders(hw, side?): Encoder[]`;
    - `setEncoderPin(hw, side, index, which: 'a' | 'b', pin): KeyboardHardware`;
    - `PinList` now includes `'encoderA' | 'encoderB'`, which `setPin` routes to `setEncoderPin`;
    - `pinUses` also lists `Encoder N A` and `Encoder N B`;
    - `setRightWiredDifferently(hw, true)` also copies the mirrored encoders into `rightEncoders`, and `false` deletes them.
  - `encoders.ts`:
    - `SensorRef { side?: Side; index: number; encoder: Encoder }`;
    - `sensorOrder(hw): SensorRef[]`;
    - `sensorLabel(side, index): string`;
    - `EncoderDraft { hw; origins: (number | undefined)[] }`;
    - `addEncoder(draft, side?)`, `removeEncoder(draft, side, index)`, `carryEncoderOrigins(before, after, origins)`.

- [ ] **Step 1: Write the failing tests.** Create `src/core/hardware/encoders.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addEncoder, carryEncoderOrigins, removeEncoder, sensorLabel, sensorOrder } from './encoders.ts';
import { testPad, testSplit } from './testFixtures.ts';
import type { KeyboardHardware } from './types.ts';
import { halfEncoders, pinUses, setEncoderPin, setPin, setRightWiredDifferently } from './wiring.ts';

const split: KeyboardHardware = { ...testSplit, encoders: [{ a: 8, b: 9 }] };

describe('encoders', () => {
  it('mirrors the left encoders on the right with A and B swapped', () => {
    expect(halfEncoders(split, 'left')).toEqual([{ a: 8, b: 9 }]);
    expect(halfEncoders(split, 'right')).toEqual([{ a: 9, b: 8 }]);
    expect(sensorOrder(split).map(({ side, index }) => [side, index])).toEqual([['left', 0], ['right', 0]]);
    expect(sensorOrder({ ...testPad, encoders: [{ a: 8, b: 9 }] }).map(({ side, index }) => [side, index])).toEqual([[undefined, 0]]);
    expect(sensorOrder(testSplit)).toEqual([]);
  });

  it('names sensors like the Sofle', () => {
    expect(sensorLabel('left', 0)).toBe('left_encoder_0');
    expect(sensorLabel('right', 1)).toBe('right_encoder_1');
    expect(sensorLabel(undefined, 0)).toBe('encoder_0');
  });

  it('sets encoder pins; a right-half pin gives the right half its own pins and encoders', () => {
    expect(setEncoderPin(split, 'left', 0, 'b', 10).encoders).toEqual([{ a: 8, b: 10 }]);
    const right = setPin(split, 'right', 'encoderA', 0, 16);
    expect(right.rightEncoders).toEqual([{ a: 16, b: 8 }]);
    expect(right.wiring).toHaveProperty('right');
    expect(right.encoders).toEqual([{ a: 8, b: 9 }]);
  });

  it('copies the encoders when the right half is wired differently, and drops them when it mirrors again', () => {
    const on = setRightWiredDifferently(split, true);
    expect(on.rightEncoders).toEqual([{ a: 9, b: 8 }]);
    expect(setRightWiredDifferently(on, false)).not.toHaveProperty('rightEncoders');
  });

  it('lists encoder pins among the pin uses', () => {
    expect(pinUses(split, 'left').get(8)).toEqual(['Encoder 0 A']);
    expect(pinUses(split, 'right').get(8)).toEqual(['Encoder 0 B']);
  });

  it('adds and removes encoders, keeping each remaining encoder’s origin', () => {
    // Mirrored: adding on the left adds on both halves. Sensor order: left 0, left 1, right 0, right 1.
    const added = addEncoder({ hw: split, origins: [0, 1] }, 'left');
    expect(added.hw.encoders).toEqual([{ a: 8, b: 9 }, { a: null, b: null }]);
    expect(added.origins).toEqual([0, undefined, 1, undefined]);
    const removed = removeEncoder(added, 'left', 0);
    expect(removed.hw.encoders).toEqual([{ a: null, b: null }]);
    expect(removed.origins).toEqual([undefined, undefined]);
    // The right half's own encoders change on their own.
    const own = setRightWiredDifferently(split, true);
    const rightOnly = removeEncoder({ hw: own, origins: [0, 1] }, 'right', 0);
    expect(rightOnly.hw.rightEncoders).toEqual([]);
    expect(rightOnly.hw.encoders).toEqual([{ a: 8, b: 9 }]);
    expect(rightOnly.origins).toEqual([0]);
  });

  it('keeps origins aligned when the right half starts mirroring again', () => {
    const own = { ...setRightWiredDifferently(split, true), rightEncoders: [] };
    // Sensor order before: left 0 only. After mirroring: left 0, right 0 (new).
    expect(carryEncoderOrigins(own, setRightWiredDifferently(own, false), [5])).toEqual([5, undefined]);
  });
});
```

Also append to `src/core/hardware/definition.test.ts`:

```ts
describe('hardware definition with encoders', () => {
  it('round-trips encoders, and leaves them out when there are none', () => {
    const withEncoders = { ...hw, encoders: [{ a: 8, b: 9 }], rightEncoders: [] };
    const text = serializeHardware(withEncoders);
    expect(parseHardware(text)).toEqual(withEncoders);
    expect(text).toContain('"encoders": [');
    expect(serializeHardware(hw)).not.toContain('ncoders');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail.**
Run: `npx vitest run src/core/hardware/encoders.test.ts src/core/hardware/definition.test.ts`
Expected: FAIL, because `./encoders.ts` can't be resolved and `halfEncoders` isn't exported.

- [ ] **Step 3: Extend `types.ts`.** Add this above `KeyboardHardware`:

```ts
/** An EC11 rotary encoder's two signal pins; its push button is an ordinary key in the matrix. */
export interface Encoder {
  a: Pin;
  b: Pin;
}
```

Add these fields to `KeyboardHardware`, after `keys`:

```ts
  /** Encoders on the left half (or the only half). */
  encoders?: Encoder[];
  /** The right half's own encoders; without it the right half mirrors the left's, with A and B swapped. */
  rightEncoders?: Encoder[];
```

- [ ] **Step 4: Extend `wiring.ts`.**
  - Change the `PinList` type to `export type PinList = 'rows' | 'cols' | 'pins' | 'encoderA' | 'encoderB';`.
  - Import the `Encoder` type.
  - Add:

```ts
/**
 * One half's encoders. Without `rightEncoders` the right half mirrors the left:
 * the same pins with A and B swapped, because a mirrored encoder turns the other way.
 */
export function halfEncoders(hw: KeyboardHardware, side?: Side): Encoder[] {
  const left = hw.encoders ?? [];
  if (side !== 'right') return left;
  return hw.rightEncoders ?? left.map((e) => ({ a: e.b, b: e.a }));
}

/** Sets an encoder pin. Setting one on a mirrored right half gives the right half its own pins first. */
export function setEncoderPin(hw: KeyboardHardware, side: Side | undefined, index: number, which: 'a' | 'b', pin: Pin): KeyboardHardware {
  const next = side === 'right' && !hw.rightEncoders ? setRightWiredDifferently(hw, true) : hw;
  const put = (list: Encoder[]) => list.map((e, i) => (i === index ? { ...e, [which]: pin } : e));
  return side === 'right' ? { ...next, rightEncoders: put(next.rightEncoders ?? []) } : { ...next, encoders: put(next.encoders ?? []) };
}
```

  - At the top of `setPin`, add: `if (list === 'encoderA' || list === 'encoderB') return setEncoderPin(hw, side, index, list === 'encoderA' ? 'a' : 'b', pin);`
  - Replace `setRightWiredDifferently` with:

```ts
/** Gives the right half its own pins and encoders (starting from the mirrored ones), or makes it a mirror again. */
export function setRightWiredDifferently(hw: KeyboardHardware, on: boolean): KeyboardHardware {
  const wiring = hw.wiring;
  const nextWiring =
    wiring.kind === 'direct'
      ? on ? { ...wiring, right: [...directPins(wiring, 'right')] } : withoutRight(wiring)
      : on ? { ...wiring, right: matrixPins(wiring, 'right') } : withoutRight(wiring);
  const next: KeyboardHardware = { ...hw, wiring: nextWiring };
  if (on) next.rightEncoders = halfEncoders(hw, 'right').map((e) => ({ ...e }));
  else delete next.rightEncoders;
  return next;
}
```

  - In `pinUses`, add this after the matrix/direct branch: `halfEncoders(hw, side).forEach((e, i) => { add(e.a, `Encoder ${i} A`); add(e.b, `Encoder ${i} B`); });`

- [ ] **Step 5: Create `encoders.ts`.**

```ts
import type { Encoder, KeyboardHardware, Side } from './types.ts';
import { halfEncoders } from './wiring.ts';

/** An encoder as a keymap sensor; the order is left then right, as in the sensors node and `sensor-bindings`. */
export interface SensorRef {
  side?: Side;
  index: number;
  encoder: Encoder;
}

export function sensorOrder(hw: KeyboardHardware): SensorRef[] {
  const sides: (Side | undefined)[] = hw.split ? ['left', 'right'] : [undefined];
  return sides.flatMap((side) => halfEncoders(hw, side).map((encoder, index) => ({ ...(side ? { side } : {}), index, encoder })));
}

/** The devicetree label of an encoder, e.g. `left_encoder_0` (Sofle style) or `encoder_0`. */
export const sensorLabel = (side: Side | undefined, index: number) => (side ? `${side}_encoder_${index}` : `encoder_${index}`);

/** Hardware plus, per sensor (in `sensorOrder`), its index before this edit (undefined for new encoders). */
export interface EncoderDraft {
  hw: KeyboardHardware;
  origins: (number | undefined)[];
}

/** Which list holds a half's encoders: the right half's own, or the left's (also the mirror's source). */
const owner = (hw: KeyboardHardware, side: Side | undefined) => (side === 'right' && hw.rightEncoders ? 'right' : 'left');

/** Maps origins from `before` to `after`; `map` gives the old index on the same half for a new (side, index). */
export function carryEncoderOrigins(
  before: KeyboardHardware,
  after: KeyboardHardware,
  origins: (number | undefined)[],
  map: (side: Side | undefined, index: number) => number | undefined = (_, index) => index,
): (number | undefined)[] {
  const old = sensorOrder(before);
  return sensorOrder(after).map(({ side, index }) => {
    const j = map(side, index);
    const at = j === undefined ? -1 : old.findIndex((s) => s.side === side && s.index === j);
    return at < 0 ? undefined : origins[at];
  });
}

export function addEncoder(draft: EncoderDraft, side?: Side): EncoderDraft {
  const list = owner(draft.hw, side);
  const blank = { a: null, b: null };
  const hw = list === 'right'
    ? { ...draft.hw, rightEncoders: [...(draft.hw.rightEncoders ?? []), blank] }
    : { ...draft.hw, encoders: [...(draft.hw.encoders ?? []), blank] };
  const oldCount = (s: Side | undefined) => halfEncoders(draft.hw, s).length;
  return {
    hw,
    origins: carryEncoderOrigins(draft.hw, hw, draft.origins, (s, i) => (owner(draft.hw, s) === list && i >= oldCount(s) ? undefined : i)),
  };
}

export function removeEncoder(draft: EncoderDraft, side: Side | undefined, index: number): EncoderDraft {
  const list = owner(draft.hw, side);
  const drop = (encoders: Encoder[] | undefined) => (encoders ?? []).filter((_, i) => i !== index);
  const hw = list === 'right' ? { ...draft.hw, rightEncoders: drop(draft.hw.rightEncoders) } : { ...draft.hw, encoders: drop(draft.hw.encoders) };
  return {
    hw,
    origins: carryEncoderOrigins(draft.hw, hw, draft.origins, (s, i) => (owner(draft.hw, s) === list && i >= index ? i + 1 : i)),
  };
}
```

- [ ] **Step 6: Serialize and parse encoders in `definition.ts`.**
  - Import the `Encoder` type.
  - In `serializeHardware`, add these after `wiring` in the object passed to `JSON.stringify`, before `keys`, so files without encoders don't change:

```ts
      ...(hw.encoders && hw.encoders.length > 0 ? { encoders: hw.encoders.map(({ a, b }) => ({ a, b })) } : {}),
      ...(hw.rightEncoders ? { rightEncoders: hw.rightEncoders.map(({ a, b }) => ({ a, b })) } : {}),
```

  - In `parseHardware`, before the `return`:

```ts
  const encoders = (value: unknown, what: string): Encoder[] => {
    if (!Array.isArray(value)) throw new Error(`${what} must be a list`);
    return value.map((e: unknown, i: number) => {
      if (!isRecord(e)) throw new Error(`${what} ${i} isn’t an object`);
      return { a: e.a === null ? null : num(e.a, `${what} ${i} a`), b: e.b === null ? null : num(e.b, `${what} ${i} b`) };
    });
  };
  const hardware: KeyboardHardware = {
    name: str(data.name, 'name'),
    displayName: str(data.displayName, 'displayName'),
    controller: str(data.controller, 'controller'),
    split: data.split === true,
    wiring,
    keys,
  };
  if (data.encoders !== undefined) hardware.encoders = encoders(data.encoders, 'encoders');
  if (data.rightEncoders !== undefined) hardware.rightEncoders = encoders(data.rightEncoders, 'rightEncoders');
  return hardware;
```

  Remove the old `return { … }` object.

  The keys are serialized after `encoders`, because `head` puts `keys: []` last and the replace targets it. Check that the definition tests' expected field order still passes.

- [ ] **Step 7: Run the tests and the whole hardware suite.**
Run: `npx vitest run src/core/hardware`
Expected: PASS. The existing snapshots are untouched, because there are no encoders.

- [ ] **Step 8: Commit.**

```bash
git add src/core/hardware
git commit -m "Model encoders on designed keyboards, mirrored like the Sofle"
```

---

### Task 2: Validate encoder pins

**Files:**
- Modify: `src/core/hardware/validate.ts`
- Test: `src/core/hardware/validate.test.ts`

**Interfaces:**
- Consumes: `halfEncoders` (Task 1).
- Produces: `validateHardware` reports encoder pins with the same messages as other pins, labelled `Encoder N A` / `Encoder N B`.

- [ ] **Step 1: Write the failing test.** Append inside `describe('validateHardware', …)` in `validate.test.ts`:

```ts
  it('checks encoder pins like any other pin', () => {
    const hw = wired();
    expect(messages({ ...hw, encoders: [{ a: 10, b: null }] })).toEqual(['Encoder 0 B on the left half has no pin.']);
    expect(messages({ ...hw, encoders: [{ a: 4, b: 9 }] })).toEqual(['D4 is used for both Row 0 and Encoder 0 A on the left half.']);
    // The right half's own encoders are checked on their own.
    const right = { ...hw, wiring: { ...hw.wiring, right: { rows: [4, 5], cols: [6, 7, 8] } }, rightEncoders: [{ a: 6, b: 9 }] } as KeyboardHardware;
    expect(messages(right)).toEqual(['D6 is used for both Column 0 and Encoder 0 A on the right half.']);
    expect(validateHardware({ ...hw, encoders: [{ a: 10, b: 14 }] })).toEqual([]);
  });
```

- [ ] **Step 2: Run the test to verify it fails.**
Run: `npx vitest run src/core/hardware/validate.test.ts`
Expected: FAIL, because encoder pins aren't checked.

- [ ] **Step 3: Implement.**
  - In `validate.ts`, import `halfEncoders` from `./wiring.ts`.
  - Change the check-once condition to `if (side !== 'right' || hw.wiring.right || hw.rightEncoders) {`.
  - Append the encoders to `labelled` by replacing its declaration with:

```ts
      const labelled: { label: string; pin: Pin }[] = [
        ...(hw.wiring.kind === 'direct'
          ? directPins(hw.wiring, side).map((pin, i) => ({ label: `Input ${i}`, pin }))
          : [
              ...matrixPins(hw.wiring, side).rows.map((pin, i) => ({ label: `Row ${i}`, pin })),
              ...matrixPins(hw.wiring, side).cols.map((pin, i) => ({ label: `Column ${i}`, pin })),
            ]),
        ...halfEncoders(hw, side).flatMap((e, i) => [
          { label: `Encoder ${i} A`, pin: e.a },
          { label: `Encoder ${i} B`, pin: e.b },
        ]),
      ];
```

- [ ] **Step 4: Run the tests.**
Run: `npx vitest run src/core/hardware/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/core/hardware/validate.ts src/core/hardware/validate.test.ts
git commit -m "Validate encoder pins together with the matrix pins"
```

---

### Task 3: Generate the encoder devicetree and Kconfig

**Files:**
- Modify: `src/core/hardware/generate.ts`
- Test: `src/core/hardware/generate.test.ts`

**Interfaces:**
- Consumes: `sensorOrder`, `sensorLabel` (Task 1).
- Produces: `generateShield` emits the encoder nodes, the sensors node, per-half `status = "okay"` overlays, and the EC11 trigger default. Output is unchanged when there are no encoders.

- [ ] **Step 1: Write the failing tests.** Append to `generate.test.ts`:

```ts
describe('generateShield: encoders', () => {
  const padWithEncoder: KeyboardHardware = { ...testPad, encoders: [{ a: 8, b: 9 }] };
  const splitWithEncoders: KeyboardHardware = { ...testSplit, encoders: [{ a: 8, b: 9 }] };

  it('defines a one-piece keyboard’s encoder and the sensors node, and picks the EC11 trigger', () => {
    const files = generateShield(padWithEncoder);
    const overlay = files[`${dir('test_pad')}/test_pad.overlay`] ?? '';
    expect(overlay).toContain(`    encoder_0: encoder_0 {
        compatible = "alps,ec11";
        a-gpios = <&pro_micro  8 (GPIO_ACTIVE_HIGH | GPIO_PULL_UP)>;
        b-gpios = <&pro_micro  9 (GPIO_ACTIVE_HIGH | GPIO_PULL_UP)>;
        steps = <80>;
    };

    sensors: sensors {
        compatible = "zmk,keymap-sensors";
        sensors = <&encoder_0>;
        triggers-per-rotation = <20>;
    };`);
    expect(files[`${dir('test_pad')}/Kconfig.defconfig`]).toBe(`# Generated by ZMK Editor from test_pad.editor.json.

if SHIELD_TEST_PAD

config ZMK_KEYBOARD_NAME
    default "Test Pad"

choice EC11_TRIGGER_MODE
    default EC11_TRIGGER_GLOBAL_THREAD
endchoice

endif
`);
  });

  it('puts a split’s encoders in the .dtsi, disabled, and enables each half’s own (right pins mirrored)', () => {
    const files = generateShield(splitWithEncoders);
    const dtsi = files[`${dir('test_split')}/test_split.dtsi`] ?? '';
    expect(dtsi).toContain(`    left_encoder_0: encoder_left_0 {
        compatible = "alps,ec11";
        a-gpios = <&pro_micro  8 (GPIO_ACTIVE_HIGH | GPIO_PULL_UP)>;
        b-gpios = <&pro_micro  9 (GPIO_ACTIVE_HIGH | GPIO_PULL_UP)>;
        steps = <80>;
        status = "disabled";
    };

    right_encoder_0: encoder_right_0 {
        compatible = "alps,ec11";
        a-gpios = <&pro_micro  9 (GPIO_ACTIVE_HIGH | GPIO_PULL_UP)>;
        b-gpios = <&pro_micro  8 (GPIO_ACTIVE_HIGH | GPIO_PULL_UP)>;
        steps = <80>;
        status = "disabled";
    };

    sensors: sensors {
        compatible = "zmk,keymap-sensors";
        sensors = <&left_encoder_0 &right_encoder_0>;
        triggers-per-rotation = <20>;
    };`);
    expect(files[`${dir('test_split')}/test_split_left.overlay`]).toContain('&left_encoder_0 {\n    status = "okay";\n};');
    expect(files[`${dir('test_split')}/test_split_left.overlay`]).not.toContain('right_encoder_0');
    expect(files[`${dir('test_split')}/test_split_right.overlay`]).toContain('&right_encoder_0 {\n    status = "okay";\n};');
    expect(files[`${dir('test_split')}/Kconfig.defconfig`]).toContain(`config ZMK_SPLIT
    default y

choice EC11_TRIGGER_MODE
    default EC11_TRIGGER_GLOBAL_THREAD
endchoice

endif
`);
  });

  it('changes nothing for keyboards without encoders', () => {
    expect(generateShield({ ...testSplit, encoders: [] })).toEqual(generateShield(testSplit));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail.**
Run: `npx vitest run src/core/hardware/generate.test.ts`
Expected: FAIL; there are no encoder nodes yet.

- [ ] **Step 3: Implement in `generate.ts`.** Import `sensorOrder` and `sensorLabel` from `./encoders.ts`, then add:

```ts
// As in ZMK's Sofle (v0.3).
const ENCODER_FLAGS = '(GPIO_ACTIVE_HIGH | GPIO_PULL_UP)';

const EC11_TRIGGER = `choice EC11_TRIGGER_MODE
    default EC11_TRIGGER_GLOBAL_THREAD
endchoice
`;

/** The encoder nodes and the sensors node, or '' without encoders. On splits every encoder starts disabled. */
function encoderNodes(hw: KeyboardHardware): string {
  const sensors = sensorOrder(hw);
  if (sensors.length === 0) return '';
  const pin = (p: Pin) => String(p ?? '?').padStart(2);
  const nodes = sensors.map(({ side, index, encoder }) =>
    [
      `    ${sensorLabel(side, index)}: ${side ? `encoder_${side}_${index}` : `encoder_${index}`} {`,
      '        compatible = "alps,ec11";',
      `        a-gpios = <&pro_micro ${pin(encoder.a)} ${ENCODER_FLAGS}>;`,
      `        b-gpios = <&pro_micro ${pin(encoder.b)} ${ENCODER_FLAGS}>;`,
      '        steps = <80>;',
      ...(hw.split ? ['        status = "disabled";'] : []),
      '    };',
    ].join('\n'),
  );
  const sensorsNode = [
    '    sensors: sensors {',
    '        compatible = "zmk,keymap-sensors";',
    `        sensors = <${sensors.map(({ side, index }) => `&${sensorLabel(side, index)}`).join(' ')}>;`,
    '        triggers-per-rotation = <20>;',
    '    };',
  ].join('\n');
  return [...nodes, sensorsNode].join('\n\n');
}
```

- In `rootFile`, after `${transformNode(hw)}` and before the physical layout, insert `${encoderNodes(hw) ? `${encoderNodes(hw)}\n\n` : ''}`, so the template reads:

```ts
${transformNode(hw)}

${encoderNodes(hw) ? `${encoderNodes(hw)}\n\n` : ''}${physicalLayoutNode(…)}
```

  Keep the physical layout node argument exactly as it is today.
- In `halfOverlay`, before pushing the kscan part, add:

```ts
  for (const { index } of sensorOrder(hw).filter((s) => s.side === side)) {
    parts.push(`&${sensorLabel(side, index)} {\n    status = "okay";\n};`);
  }
```

- In `kconfigDefconfig`, compute `const trigger = sensorOrder(hw).length > 0 ? `\n${EC11_TRIGGER}` : '';`.
  - In the unibody return, use `` `…\n\nif ${first?.symbol ?? ''}\n\n${name}${trigger}\nendif\n` ``.
  - In the split template, replace the last block's `    default y\n\nendif` with `    default y\n${trigger}\nendif`.

  Check the exact expected texts in Step 1: with no encoders the output must stay byte-identical.

- [ ] **Step 4: Run the tests.**
Run: `npx vitest run src/core/hardware test/customKeyboards.test.ts`
Expected: PASS, and the existing snapshots are unchanged.

- [ ] **Step 5: Commit.**

```bash
git add src/core/hardware/generate.ts src/core/hardware/generate.test.ts
git commit -m "Generate EC11 encoder nodes, the sensors node and the trigger default"
```

---

### Task 4: Keymap sensor bindings and settings

**Files:**
- Modify: `src/core/hardware/starter.ts`, `src/core/hardware/keys.ts`, `src/core/hardware/config.ts`, `src/core/catalog/settings.ts`
- Test: `src/core/hardware/keys.test.ts`, `src/core/hardware/config.test.ts`, `src/core/catalog/settings.test.ts`

**Interfaces:**
- Consumes: `sensorOrder` (Task 1).
- Produces:
  - `starterKeymap` gives layer 0 one `&inc_dec_kp C_VOL_UP C_VOL_DN` per sensor.
  - `remapSensors(model, newToOld: (number | undefined)[]): KeymapModel`, in `keys.ts`.
  - `applyHardware(config, hw, newToOld, sensorNewToOld?)`: the optional 4th parameter defaults to keeping indices.
  - Settings: EC11 counts as available, and on by default, when the keyboard has encoders.

- [ ] **Step 1: Write the failing tests.**

Append to `keys.test.ts` (add `remapSensors` to its import from `./keys.ts`):

```ts
describe('remapSensors', () => {
  const volume = { behavior: 'inc_dec_kp', params: ['C_VOL_UP', 'C_VOL_DN'] };
  const pages = { behavior: 'inc_dec_kp', params: ['PG_UP', 'PG_DN'] };
  const model = { ...starterKeymap(pad), layers: [{ name: 'default_layer', bindings: [], properties: [], sensorBindings: [pages] }, { name: 'nav', bindings: [], properties: [] }] };

  it('keeps bindings of kept encoders, gives new ones volume on the base layer and &trans elsewhere', () => {
    const next = remapSensors(model, [undefined, 0]);
    expect(next.layers[0]?.sensorBindings).toEqual([volume, pages]);
    expect(next.layers[1]?.sensorBindings).toEqual([{ behavior: 'trans', params: [] }, { behavior: 'trans', params: [] }]);
  });

  it('removes sensor bindings when there are no encoders left', () => {
    expect(remapSensors(model, []).layers[0]).not.toHaveProperty('sensorBindings');
  });
});
```

Append to `config.test.ts`:

```ts
  it('starts encoders on volume, and keeps their bindings when hardware is edited', () => {
    const withEncoder = { ...testSplit, encoders: [{ a: 8, b: 9 }] };
    const start = newHardwareConfig(withEncoder, 'v0.3');
    expect(start.keymap.layers[0]?.sensorBindings?.map(formatBinding)).toEqual(['&inc_dec_kp C_VOL_UP C_VOL_DN', '&inc_dec_kp C_VOL_UP C_VOL_DN']);
    const custom = { ...start, keymap: { ...start.keymap, layers: start.keymap.layers.map((l) => ({ ...l, sensorBindings: [{ behavior: 'inc_dec_kp', params: ['PG_UP', 'PG_DN'] }, { behavior: 'inc_dec_kp', params: ['C_VOL_UP', 'C_VOL_DN'] }] })) } };
    // Add a second left encoder (and its mirror): sensor order left 0, left 1, right 0, right 1.
    const two = { ...withEncoder, encoders: [{ a: 8, b: 9 }, { a: 10, b: 16 }] };
    const { config } = applyHardware(custom, two, testSplit.keys.map((_, i) => i), [0, undefined, 1, undefined]);
    expect(config.keymap.layers[0]?.sensorBindings?.map(formatBinding)).toEqual([
      '&inc_dec_kp PG_UP PG_DN',
      '&inc_dec_kp C_VOL_UP C_VOL_DN',
      '&inc_dec_kp C_VOL_UP C_VOL_DN',
      '&inc_dec_kp C_VOL_UP C_VOL_DN',
    ]);
    expect(importConfig(generateConfig(config)).config).toEqual(config);
  });
```

Append to `settings.test.ts`, inside `describe('settings a designed keyboard has no hardware for', …)`:

```ts
  it('treats encoders as supported and on when the keyboard has them', () => {
    const withEncoder = newHardwareConfig({ ...testSplit, encoders: [{ a: 8, b: 9 }] }, 'v0.3');
    const def = findSetting('EC11');
    if (!def) throw new Error('setting');
    expect(unsupportedHardwareSettings({ ...withEncoder, kconfig: writeSetting(withEncoder.kconfig, def, true) })).toEqual([]);
    // No line in the .conf: ZMK turns EC11 on for the enabled encoder nodes, so no warning.
    expect(settingWarnings(withEncoder).some((w) => w.fix?.name === 'EC11')).toBe(false);
    // Written off explicitly: the encoders wouldn't work, so offer to turn it on.
    const off = { ...withEncoder, kconfig: writeSetting(withEncoder.kconfig, def, false) };
    expect(settingWarnings(off)).toContainEqual(expect.objectContaining({ fix: { name: 'EC11', value: true } }));
  });
```

- [ ] **Step 2: Run the tests to verify they fail.**
Run: `npx vitest run src/core/hardware src/core/catalog/settings.test.ts`
Expected: FAIL, because `remapSensors` is missing, the starter keymap has no sensor bindings, and EC11 is flagged as unsupported.

- [ ] **Step 3: Implement.**

`starter.ts` (import `sensorOrder` from `./encoders.ts`): replace the `layers:` line with

```ts
    layers: [
      {
        name: 'default_layer',
        displayName: 'Base',
        bindings,
        properties: [],
        ...(sensorOrder(hw).length > 0
          ? { sensorBindings: sensorOrder(hw).map(() => ({ behavior: 'inc_dec_kp', params: ['C_VOL_UP', 'C_VOL_DN'] })) }
          : {}),
      },
    ],
```

`keys.ts`:

```ts
/**
 * Moves every layer's sensor bindings to a new encoder list. `newToOld[i]` is the
 * old index of sensor `i`, or undefined for a new encoder (volume on the base
 * layer, `&trans` elsewhere). No encoders left: the bindings are removed.
 */
export function remapSensors(model: KeymapModel, newToOld: (number | undefined)[]): KeymapModel {
  const layers = model.layers.map((layer, li) => {
    const next = { ...layer };
    if (newToOld.length === 0) {
      delete next.sensorBindings;
      return next;
    }
    const old = layer.sensorBindings ?? [];
    next.sensorBindings = newToOld.map((o) => {
      const kept = o === undefined ? undefined : old[o];
      if (kept) return kept;
      return li === 0 ? { behavior: 'inc_dec_kp', params: ['C_VOL_UP', 'C_VOL_DN'] } : trans();
    });
    return next;
  });
  return { ...model, layers };
}
```

`config.ts` (import `sensorOrder` from `./encoders.ts` and `remapSensors` from `./keys.ts`): change `applyHardware`:

```ts
export function applyHardware(
  config: ZmkConfig,
  hw: KeyboardHardware,
  newToOld: (number | undefined)[],
  sensorNewToOld: (number | undefined)[] = sensorOrder(hw).map((_, i) => i),
): { config: ZmkConfig; notes: string[] } {
  const remapped = remapKeyPositions(config.keymap, newToOld);
  const model = remapSensors(remapped.model, sensorNewToOld);
  const shields = new Set(shieldNames(hw));
  const include = config.build.include.map((t) => (shields.has(t.shield?.split(' ')[0] ?? '') ? { ...t, board: hw.controller } : t));
  return { config: { ...config, keymap: model, hardware: hw, build: { include } }, notes: remapped.notes };
}
```

Update its doc comment to mention sensor bindings.

`settings.ts` (import `sensorOrder` from `../hardware/encoders.ts`):
- In `lacksHardwareFor`, after the first guard, add `if (name === 'EC11') return sensorOrder(config.hardware).length === 0;`.
- In `settingWarnings`, make the `value` helper treat EC11 as on by default for designed keyboards with encoders:

```ts
  const value = (name: string) => {
    const def = findSetting(name);
    if (!def) return undefined;
    const set = readSetting(config.kconfig, def);
    if (set === undefined && name === 'EC11' && config.hardware && sensorOrder(config.hardware).length > 0) return true;
    return set ?? def.default;
  };
```

- [ ] **Step 4: Run the tests.**
Run: `npx vitest run src/core`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/core
git commit -m "Give encoders keymap bindings that survive hardware edits"
```

---

### Task 5: Encoders in the wizard

**Files:**
- Modify: `src/ui/components/HardwareWizard.tsx`, `src/ui/components/HardwareWiringStep.tsx`, `src/ui/components/HardwareLayoutStep.tsx`
- Test: `src/ui/NewKeyboard.test.tsx`

**Interfaces:**
- Consumes: `addEncoder`, `removeEncoder`, `carryEncoderOrigins`, `sensorOrder` (Task 1); `halfEncoders`; `applyHardware` with its 4th parameter (Task 4).
- Produces:
  - `HardwareDraft` gains `encoderOrigins: (number | undefined)[]`.
  - `HardwareWiringStep` gets new props `onAddEncoder(side?: Side)` and `onRemoveEncoder(side: Side | undefined, index: number)`.
  - Labels: `Encoder 0 A` (unibody) or `Left encoder 0 A` (split); buttons `Add encoder` and `Remove encoder 0`.

- [ ] **Step 1: Write the failing tests.** Append to `src/ui/NewKeyboard.test.tsx`:

```tsx
describe('Encoders in the wizard', () => {
  it('adds an encoder, picks its pins, and shows it in the generated shield', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openWizard(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.click(screen.getByRole('button', { name: 'Add encoder' }));
    await user.selectOptions(screen.getByLabelText('Left encoder 0 A'), '8');
    await user.click(screen.getByLabelText('Left encoder 0 B'));
    await user.click(within(screen.getByRole('figure', { name: 'Pro Micro pinout (left half)' })).getByRole('button', { name: 'D9' }));
    expect(screen.getByLabelText('Left encoder 0 B')).toHaveProperty('value', '9');
    expect(screen.getByRole('button', { name: 'D8: Encoder 0 A' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/push button is wired like any other switch/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const dtsi = screen.getByLabelText('config/boards/shields/my_keyboard/my_keyboard.dtsi').textContent ?? '';
    expect(dtsi).toContain('left_encoder_0: encoder_left_0');
    expect(dtsi).toContain('right_encoder_0: encoder_right_0');
  });

  it('removes an encoder', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openWizard(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Add encoder' }));
    await user.click(screen.getByRole('button', { name: 'Remove encoder 0' }));
    expect(screen.queryByLabelText('Left encoder 0 A')).toBeNull();
  });

  it('keeps an encoder’s bindings when another encoder is added later', async () => {
    const hw = { ...testSplit, encoders: [{ a: 8, b: 9 }] };
    const config = newHardwareConfig(hw, 'v0.3');
    config.keymap = { ...config.keymap, layers: config.keymap.layers.map((l) => ({ ...l, sensorBindings: [{ behavior: 'inc_dec_kp', params: ['PG_UP', 'PG_DN'] }, { behavior: 'inc_dec_kp', params: ['C_VOL_UP', 'C_VOL_DN'] }] })) };
    localStorage.setItem('zmk-editor.config.v1', JSON.stringify({ config }));

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Test Split ▾' }));
    await user.click(screen.getByRole('button', { name: 'Edit hardware' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Add encoder' }));
    await user.selectOptions(screen.getByLabelText('Left encoder 1 A'), '10');
    await user.selectOptions(screen.getByLabelText('Left encoder 1 B'), '16');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Save hardware' }));

    const saved = stored();
    expect(saved.keymap.layers[0].sensorBindings.map((b: { params: string[] }) => b.params.join(' '))).toEqual([
      'PG_UP PG_DN',
      'C_VOL_UP C_VOL_DN',
      'C_VOL_UP C_VOL_DN',
      'C_VOL_UP C_VOL_DN',
    ]);
  });
});
```

`newHardwareConfig` is already imported in this file. Add `testSplit` to the existing import from `../core/hardware/testFixtures.ts`.

- [ ] **Step 2: Run the tests to verify they fail.**
Run: `npx vitest run src/ui/NewKeyboard.test.tsx -t "Encoders"`
Expected: FAIL: `Unable to find role="button" and name "Add encoder"`.

- [ ] **Step 3: `HardwareWizard.tsx`.**
  - Import `addEncoder`, `carryEncoderOrigins`, `removeEncoder` and `sensorOrder` from `../../core/hardware/encoders.ts`, and the `Side` type.
  - Add `encoderOrigins: (number | undefined)[];` to `HardwareDraft`, with the doc comment "Per sensor (in sensorOrder), its index before this edit".
  - `freshDraft` returns `encoderOrigins: []`. The edit-mode initial draft uses `encoderOrigins: sensorOrder(existing).map((_, i) => i)`.
  - Wiring step props:

```tsx
      {step === 1 && (
        <HardwareWiringStep
          hw={draft.hw}
          issues={issues.filter((i) => i.area === 'wiring')}
          onChange={(hw) => setDraft({ ...draft, hw, encoderOrigins: carryEncoderOrigins(draft.hw, hw, draft.encoderOrigins) })}
          onAddEncoder={(side?: Side) => {
            const next = addEncoder({ hw: draft.hw, origins: draft.encoderOrigins }, side);
            setDraft({ ...draft, hw: next.hw, encoderOrigins: next.origins });
          }}
          onRemoveEncoder={(side: Side | undefined, index: number) => {
            const next = removeEncoder({ hw: draft.hw, origins: draft.encoderOrigins }, side, index);
            setDraft({ ...draft, hw: next.hw, encoderOrigins: next.origins });
          }}
        />
      )}
```

  - In `finish()` for edit mode, pass `draft.encoderOrigins` as the 4th argument to `applyHardware`.
  - Wherever the wizard builds a new draft from `hw` while keeping `origins`, it must keep `encoderOrigins` too. The `{ ...draft, hw }` spreads already do. In `leaveBasics`, `freshDraft` resets it.

- [ ] **Step 4: `HardwareWiringStep.tsx`.**
  - Import `halfEncoders`.
  - Add the two props to `Props` and pass them down to `PinTables` (a new `onAddEncoder` / `onRemoveEncoder` pair).
  - In `PinTables`, after the pin lists, render the encoder section for this half. Show it only when the half owns its encoder list: always for the left / only half, and for the right half only when `hw.rightEncoders !== undefined`. A mirrored right half has no card.

```tsx
      <fieldset className="fieldset">
        <legend>Encoders</legend>
        {halfEncoders(hw, side).length === 0 && <p className="muted small">No encoders. Most keyboards have none, one or two per half.</p>}
        {halfEncoders(hw, side).map((encoder, index) => (
          <div key={index} className="encoder-pins">
            {(['a', 'b'] as const).map((which) => {
              const list = which === 'a' ? 'encoderA' : 'encoderB';
              const id = `pin-${side ?? 'one'}-${list}-${index}`;
              const name = `Encoder ${index} ${which.toUpperCase()}`;
              const label = prefix ? `${prefix}${name.charAt(0).toLowerCase()}${name.slice(1)}` : name;
              const pin = encoder[which];
              const isActive = active !== null && active.side === side && active.list === list && active.index === index;
              return (
                <div key={which} className="field">
                  <label className="field-label" htmlFor={id}>{label}</label>
                  <select
                    id={id}
                    className={`input${isActive ? ' active-pin' : ''}`}
                    value={pin ?? ''}
                    onPointerDown={() => onActivate({ side, list, index, label })}
                    onChange={(e) => onChange(setPin(hw, side, list, index, e.target.value === '' ? null : Number(e.target.value)))}
                  >
                    <option value="">No pin</option>
                    {PRO_MICRO_PINS.map((p) => {
                      const other = (uses.get(p) ?? []).filter((use) => use !== name);
                      return (
                        <option key={p} value={p}>
                          {pinLabel(p)}
                          {other.length > 0 ? ` (${other.join(', ')})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              );
            })}
            <button type="button" className="link-button" onClick={() => onRemoveEncoder(side, index)}>
              Remove encoder {index}
            </button>
          </div>
        ))}
        <button type="button" className="button" onClick={() => onAddEncoder(side)}>
          Add encoder
        </button>
      </fieldset>
```

  - The pin `<select>` markup and the `other` filter already exist for the row/column fields. Move them into a local `PinSelect` component that both use, rather than duplicating them.
  - With the right half mirrored, a short note under the left half's encoders: "The right half gets the same encoders, with A and B swapped so both turn the same way." Show it when `hw.split && !differently`.
  - Add CSS `.encoder-pins { display: grid; grid-template-columns: repeat(2, minmax(104px, 1fr)) auto; gap: 8px; align-items: end; }` to `src/ui/styles.css`, next to `.pin-grid`.

- [ ] **Step 5: `HardwareLayoutStep.tsx`.** Import `sensorOrder`. Under the existing help paragraph, add:

```tsx
        {sensorOrder(hw).length > 0 && (
          <p className="muted small">
            An encoder’s push button is wired like any other switch: add a key for it here and give it a row and column.
          </p>
        )}
```

- [ ] **Step 6: Run the tests.**
Run: `npx vitest run src/ui && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/ui
git commit -m "Add encoders to the keyboard wizard's wiring step"
```

---

### Task 6: Encoders in the CI fixtures, docs and full check

**Files:**
- Modify: `test/customKeyboards.test.ts`, `test/generated/editor_*/**` (snapshots), `README.md`

- [ ] **Step 1: Give the fixtures encoders.** In `test/customKeyboards.test.ts`:
  - `split`: add `encoders: [{ a: 8, b: 9 }]`. That's a mirrored split with one encoder per half; pins 8 and 9 are free.
  - `numpad`: add `encoders: [{ a: 14, b: 15 }]`, a one-piece keyboard.
  - `duo`: add `encoders: [{ a: 8, b: 9 }], rightEncoders: []`, a split whose right half has its own pins and no encoder.

- [ ] **Step 2: Regenerate the snapshots and check them.**
Run: `npx vitest run test/customKeyboards.test.ts -u`

Then check the generated files:
- `test/generated/editor_split/config/boards/shields/editor_split/editor_split.dtsi` has two encoder nodes (the right one with A = 9, B = 8) and `sensors = <&left_encoder_0 &right_encoder_0>`.
- `editor_split.keymap` layer 0 has two `&inc_dec_kp C_VOL_UP C_VOL_DN`.
- `editor_duo`'s right overlay has no encoder.
- Each fixture's `Kconfig.defconfig` sets `EC11_TRIGGER_GLOBAL_THREAD`.
- `git diff --stat -- test/generated/lily58` is empty.

- [ ] **Step 3: Docs.** In `README.md`, add "rotary encoders" to the "design your own keyboard" feature text.

- [ ] **Step 4: Full check.**
Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit, then push to the PR branch.** CI's Firmware build check builds the fixtures with real ZMK, and that run is the proof that the generated encoder nodes and Kconfig compile.

```bash
git add test README.md
git commit -m "Build designed keyboards with encoders in CI"
git push origin main-7trpb8
```

After the push, check that the **Firmware build check** run passes for all seven targets. A failure there means the generated devicetree or Kconfig is wrong: fix `generate.ts` and regenerate, don't touch the workflow.
