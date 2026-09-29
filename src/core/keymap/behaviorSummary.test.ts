import { describe, expect, it } from 'vitest';
import { createBehavior } from './behaviorEdit.ts';
import { behaviorSection, behaviorSummary, kindLabel } from './behaviorSummary.ts';
import { emptyKeymap, type Behavior } from './model.ts';

const model = emptyKeymap();
const make = (kind: Parameters<typeof createBehavior>[1]) => createBehavior(model, kind);

describe('behaviorSummary', () => {
  it('names a hold-tap’s behaviors and its tapping term', () => {
    const ht = make('hold-tap');
    expect(behaviorSummary(ht, model)).toBe('Hold: Key press · Tap: Key press · 200 ms');
    const layerTap = { ...ht, bindings: [{ behavior: 'mo', params: [] }, { behavior: 'kp', params: [] }], properties: [] };
    expect(behaviorSummary(layerTap, model)).toBe('Hold: Momentary layer · Tap: Key press · 200 ms');
  });

  it('shows what a mod-morph turns into and with which modifiers', () => {
    expect(behaviorSummary(make('mod-morph'), model)).toBe(', → ; with Shift, RShift');
    const bare = { ...make('mod-morph'), properties: [] };
    expect(behaviorSummary(bare, model)).toBe(', → ; with a modifier');
  });

  it('lists tap-dance taps, encoder directions and macro steps', () => {
    expect(behaviorSummary(make('tap-dance'), model)).toBe('A · B');
    expect(behaviorSummary(make('sensor-rotate'), model)).toMatch(/^↻ .+ · ↺ .+$/);
    const macro = make('macro');
    expect(behaviorSummary(macro, model)).toBe('1 step');
    expect(behaviorSummary({ ...macro, bindings: [...macro.bindings, { behavior: 'kp', params: ['A'] }] }, model)).toBe('2 steps');
  });

  it('falls back to the kind for other behaviors', () => {
    const other: Behavior = { name: 'x', label: 'x', compatible: 'zmk,behavior-caps-word', properties: [], bindings: [] };
    expect(behaviorSummary(other, model)).toBe('Other');
    expect(kindLabel(other)).toBe('Other');
  });
});

describe('behaviorSection', () => {
  it('sorts behaviors into the list’s sections', () => {
    expect(behaviorSection(make('hold-tap'))).toBe('hold-tap');
    expect(behaviorSection(make('sensor-rotate'))).toBe('sensor-rotate');
    expect(behaviorSection({ compatible: 'zmk,behavior-leader-key' })).toBe('module');
    expect(behaviorSection({ compatible: 'zmk,behavior-caps-word' })).toBe('other');
  });
});
