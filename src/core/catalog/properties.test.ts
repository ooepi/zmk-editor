import { describe, expect, it } from 'vitest';
import type { DtProperty } from '../dts/ast.ts';
import { HOLD_TAP_PROPERTIES, MOD_MORPH_PROPERTIES, propertySchema, readProperty, writeProperty } from './properties.ts';

const schema = (list: typeof HOLD_TAP_PROPERTIES, name: string) => {
  const found = list.find((p) => p.name === name);
  if (!found) throw new Error(name);
  return found;
};

describe('properties', () => {
  const props: DtProperty[] = [
    { name: 'flavor', values: [{ kind: 'string', value: 'balanced' }] },
    { name: 'tapping-term-ms', values: [{ kind: 'cells', tokens: ['200'] }] },
    { name: 'retro-tap', values: [] },
    { name: 'hold-trigger-key-positions', values: [{ kind: 'cells', tokens: ['1', '2', 'LT0'] }] },
  ];

  it('reads typed values', () => {
    expect(readProperty(props, schema(HOLD_TAP_PROPERTIES, 'flavor'))).toBe('balanced');
    expect(readProperty(props, schema(HOLD_TAP_PROPERTIES, 'tapping-term-ms'))).toBe(200);
    expect(readProperty(props, schema(HOLD_TAP_PROPERTIES, 'retro-tap'))).toBe(true);
    expect(readProperty(props, schema(HOLD_TAP_PROPERTIES, 'hold-trigger-on-release'))).toBe(false);
    expect(readProperty(props, schema(HOLD_TAP_PROPERTIES, 'quick-tap-ms'))).toBeUndefined();
    expect(readProperty(props, schema(HOLD_TAP_PROPERTIES, 'hold-trigger-key-positions'))).toEqual(['1', '2', 'LT0']);
  });

  it('writes values in place and removes unset ones', () => {
    let next = writeProperty(props, schema(HOLD_TAP_PROPERTIES, 'tapping-term-ms'), 280);
    expect(next[1]).toEqual({ name: 'tapping-term-ms', values: [{ kind: 'cells', tokens: ['280'] }] });
    next = writeProperty(next, schema(HOLD_TAP_PROPERTIES, 'retro-tap'), false);
    expect(next.map((p) => p.name)).not.toContain('retro-tap');
    next = writeProperty(next, schema(HOLD_TAP_PROPERTIES, 'quick-tap-ms'), 150);
    expect(next.at(-1)).toEqual({ name: 'quick-tap-ms', values: [{ kind: 'cells', tokens: ['150'] }] });
    next = writeProperty(next, schema(HOLD_TAP_PROPERTIES, 'flavor'), undefined);
    expect(next.map((p) => p.name)).not.toContain('flavor');
  });

  it('reads and writes modifier masks', () => {
    const mods = schema(MOD_MORPH_PROPERTIES, 'mods');
    const list: DtProperty[] = [{ name: 'mods', values: [{ kind: 'cells', tokens: ['(MOD_LSFT|MOD_RSFT)'] }] }];
    expect(readProperty(list, mods)).toEqual(['MOD_LSFT', 'MOD_RSFT']);
    expect(writeProperty([], mods, ['MOD_LCTL'])).toEqual([
      { name: 'mods', values: [{ kind: 'cells', tokens: ['(MOD_LCTL)'] }] },
    ]);
    expect(writeProperty(list, mods, [])).toEqual([]);
  });

  it('finds the schema for a compatible', () => {
    expect(propertySchema('zmk,behavior-hold-tap')).toBe(HOLD_TAP_PROPERTIES);
    expect(propertySchema('zmk,behavior-unknown')).toBeUndefined();
  });
});
