import { describe, expect, it } from 'vitest';
import { formatBinding } from '../../core/keymap/bindings.ts';
import { demoConfig } from './demo.ts';
import { editorReducer, initialState, type EditorAction, type EditorState } from './editorReducer.ts';

const run = (state: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, state);
const start = () => initialState(demoConfig().config);
const binding = (state: EditorState, layer: number, key: number) =>
  formatBinding(state.config.keymap.layers[layer]?.bindings[key] ?? { behavior: '?', params: [] });

describe('editorReducer', () => {
  it('sets the selected key and undoes/redoes it', () => {
    let state = run(start(), { type: 'selectLayer', index: 1 }, { type: 'selectKey', index: 5 });
    state = run(state, { type: 'setBinding', binding: { behavior: 'kp', params: ['X'] } });
    expect(binding(state, 1, 5)).toBe('&kp X');
    state = run(state, { type: 'undo' });
    expect(binding(state, 1, 5)).toBe('&bt BT_SEL 4');
    state = run(state, { type: 'redo' });
    expect(binding(state, 1, 5)).toBe('&kp X');
  });

  it('places palette items on a key of the current layer and selects it', () => {
    let state = run(start(), { type: 'selectLayer', index: 1 });
    const before = binding(state, 1, 5);
    state = run(state, { type: 'placeOnKey', index: 5, item: { kind: 'keycode', token: 'X' } });
    expect(binding(state, 1, 5)).toBe('&kp X');
    expect(state.key).toBe(5);
    state = run(state, { type: 'placeOnKey', index: 5, item: { kind: 'binding', binding: { behavior: 'mo', params: ['2'] } } });
    expect(binding(state, 1, 5)).toBe('&mo 2');
    state = run(state, { type: 'undo' }, { type: 'undo' });
    expect(binding(state, 1, 5)).toBe(before);
  });

  it('swaps and copies keys as single undo steps', () => {
    const a = binding(start(), 0, 0);
    const b = binding(start(), 0, 1);
    let state = run(start(), { type: 'swapKeys', from: 0, to: 1 });
    expect([binding(state, 0, 0), binding(state, 0, 1)]).toEqual([b, a]);
    expect(state.key).toBe(1);
    state = run(state, { type: 'undo' }, { type: 'copyKey', from: 0, to: 1 });
    expect([binding(state, 0, 0), binding(state, 0, 1)]).toEqual([a, a]);
    state = run(state, { type: 'undo' });
    expect([binding(state, 0, 0), binding(state, 0, 1)]).toEqual([a, b]);
  });

  it('ignores a key dropped on itself', () => {
    const state = start();
    expect(run(state, { type: 'swapKeys', from: 2, to: 2 }).past).toHaveLength(0);
  });

  it('keeps key and selection in step', () => {
    let state = run(start(), { type: 'selectKey', index: 3 });
    expect([state.key, state.selection]).toEqual([3, [3]]);
    state = run(state, { type: 'toggleKey', index: 5 });
    expect([state.key, state.selection]).toEqual([null, [3, 5]]);
    state = run(state, { type: 'toggleKey', index: 3 });
    expect([state.key, state.selection]).toEqual([5, [5]]);
    state = run(state, { type: 'selectKeys', indices: [1, 2], additive: true });
    expect(state.selection).toEqual([5, 1, 2]);
    state = run(state, { type: 'selectKeys', indices: [7], additive: false });
    expect([state.key, state.selection]).toEqual([7, [7]]);
    state = run(state, { type: 'selectSensor', index: 0 });
    expect([state.key, state.selection]).toEqual([null, []]);
  });

  it('places a palette item on every selected key in one step', () => {
    let state = run(start(), { type: 'selectKeys', indices: [0, 1, 2], additive: false });
    state = run(state, { type: 'placeOnSelection', item: { kind: 'binding', binding: { behavior: 'trans', params: [] } } });
    expect([0, 1, 2].map((i) => binding(state, 0, i))).toEqual(['&trans', '&trans', '&trans']);
    expect(state.past).toHaveLength(1);
  });

  it('copies keys to the same positions on another layer', () => {
    const originals = [0, 1].map((i) => binding(start(), 0, i));
    let state = run(start(), { type: 'selectKeys', indices: [0, 1], additive: false }, { type: 'copyKeys' });
    expect(state.clipboard?.keys).toHaveLength(2);
    expect(state.past).toHaveLength(0);
    state = run(state, { type: 'selectLayer', index: 3 }, { type: 'pasteKeys' });
    expect([0, 1].map((i) => binding(state, 3, i))).toEqual(originals);
    expect(run(state, { type: 'undo' }).past).toHaveLength(0);
  });

  it('pastes one copied key onto all selected keys', () => {
    const esc = binding(start(), 0, 0);
    let state = run(start(), { type: 'selectKey', index: 0 }, { type: 'copyKeys' });
    state = run(state, { type: 'selectKeys', indices: [2, 3], additive: false }, { type: 'pasteKeys' });
    expect([binding(state, 0, 2), binding(state, 0, 3)]).toEqual([esc, esc]);
  });

  it('explains a paste that would change nothing', () => {
    let state = run(start(), { type: 'selectKeys', indices: [0, 1], additive: false }, { type: 'copyKeys' }, { type: 'pasteKeys' });
    expect(state.past).toHaveLength(0);
    expect(state.notice).toMatch(/Switch to another layer/);
    state = run(start(), { type: 'selectKey', index: 0 }, { type: 'copyKeys' }, { type: 'selectKey', index: null }, { type: 'pasteKeys' });
    expect(state.notice).toMatch(/Select the keys/);
  });

  it('cuts keys to the clipboard and leaves them transparent', () => {
    const a = binding(start(), 0, 0);
    let state = run(start(), { type: 'selectKey', index: 0 }, { type: 'cutKeys' });
    expect(binding(state, 0, 0)).toBe('&trans');
    state = run(state, { type: 'selectKey', index: 4 }, { type: 'pasteKeys' });
    expect(binding(state, 0, 4)).toBe(a);
  });

  it('copies a key dragged from another layer', () => {
    const a = binding(start(), 0, 0);
    const state = run(start(), { type: 'selectLayer', index: 3 }, { type: 'copyKey', from: 0, to: 2, fromLayer: 0 });
    expect(binding(state, 3, 2)).toBe(a);
    expect(binding(state, 0, 0)).toBe(a);
  });

  it('drops keycodes on an encoder direction and selects the encoder', () => {
    let state = run(start(), { type: 'selectKey', index: 2 });
    state = run(state, { type: 'placeOnEncoder', index: 0, direction: 'cw', item: { kind: 'keycode', token: 'PG_UP' } });
    expect(state.config.keymap.layers[0]?.sensorBindings?.map(formatBinding)).toEqual(['&inc_dec_kp PG_UP C_VOL_DN']);
    expect([state.sensor, state.key, state.selection]).toEqual([0, null, []]);
    expect(run(state, { type: 'undo' }).config.keymap.layers[0]?.sensorBindings?.map(formatBinding)).toEqual([
      '&inc_dec_kp C_VOL_UP C_VOL_DN',
    ]);
  });

  it('explains that other behaviors cannot go on an encoder', () => {
    const state = start();
    const item = { kind: 'binding' as const, binding: { behavior: 'mo', params: ['1'] } };
    const next = run(state, { type: 'placeOnEncoder', index: 0, direction: 'cw', item });
    expect(next.config).toBe(state.config);
    expect(next.past).toHaveLength(0);
    expect(next.notice).toMatch(/Only keys, Transparent and None/);
  });

  it('ignores setBinding without a selected key', () => {
    const state = start();
    expect(run(state, { type: 'setBinding', binding: { behavior: 'kp', params: ['X'] } })).toBe(state);
  });

  it('selects a new layer after adding it and follows a moved layer', () => {
    let state = run(start(), { type: 'addLayer', name: 'Gaming' });
    expect(state.layer).toBe(6);
    state = run(state, { type: 'moveLayer', from: 6, to: 1 });
    expect(state.layer).toBe(1);
    expect(state.config.keymap.layers[1]?.displayName).toBe('Gaming');
  });

  it('keeps the selected layer in range after deleting and undoing', () => {
    let state = run(start(), { type: 'selectLayer', index: 5 }, { type: 'deleteLayer', index: 5 });
    expect(state.layer).toBe(4);
    expect(state.config.keymap.layers).toHaveLength(5);
    state = run(state, { type: 'undo' });
    expect(state.config.keymap.layers).toHaveLength(6);
  });

  it('stays on the same layer when another layer is moved past it', () => {
    const shown = (state: EditorState) => state.config.keymap.layers[state.layer]?.name;
    let state = run(start(), { type: 'selectLayer', index: 2 });
    const before = shown(state);
    state = run(state, { type: 'moveLayer', from: 1, to: 2 });
    expect(shown(state)).toBe(before);
    state = run(state, { type: 'moveLayer', from: 4, to: 0 });
    expect(shown(state)).toBe(before);
  });

  it('stays on the same layer when a layer before it is deleted', () => {
    const shown = (state: EditorState) => state.config.keymap.layers[state.layer]?.name;
    let state = run(start(), { type: 'selectLayer', index: 4 });
    const before = shown(state);
    state = run(state, { type: 'deleteLayer', index: 1 });
    expect(state.layer).toBe(3);
    expect(shown(state)).toBe(before);
  });

  it('marks a notice transient only when asked, and a later notice clears the mark', () => {
    let state = run(start(), { type: 'notify', notice: 'Combo saved.', transient: true });
    expect(state.notice).toBe('Combo saved.');
    expect(state.noticeTransient).toBe(true);
    state = run(state, { type: 'selectKey', index: 3 });
    expect(state.noticeTransient).toBe(true);
    state = run(state, { type: 'notify', notice: 'Something to read.' });
    expect(state.noticeTransient).toBe(false);
    state = run(state, { type: 'notify', notice: 'Again.', transient: true }, { type: 'dismissNotice' });
    expect(state.noticeTransient).toBe(false);
  });

  it('never deletes the last layer', () => {
    let state = start();
    for (let i = 0; i < 6; i++) state = run(state, { type: 'deleteLayer', index: 0 });
    expect(state.config.keymap.layers).toHaveLength(1);
  });

  it('selects an encoder and sets its binding on the current layer', () => {
    let state = run(start(), { type: 'selectKey', index: 3 }, { type: 'selectSensor', index: 0 });
    expect(state.key).toBeNull();
    state = run(state, { type: 'setSensorBinding', binding: { behavior: 'inc_dec_kp', params: ['PG_UP', 'PG_DN'] } });
    expect(state.config.keymap.layers[0]?.sensorBindings?.map(formatBinding)).toEqual(['&inc_dec_kp PG_UP PG_DN']);
    expect(run(state, { type: 'undo' }).config.keymap.layers[0]?.sensorBindings?.map(formatBinding)).toEqual([
      '&inc_dec_kp C_VOL_UP C_VOL_DN',
    ]);
  });

  it('records generic edits for undo', () => {
    const state = start();
    const keymap = { ...state.config.keymap, combos: [] };
    const edited = run(state, { type: 'edit', keymap, notice: 'Done' });
    expect(edited.config.keymap).toBe(keymap);
    expect(edited.notice).toBe('Done');
    expect(run(edited, { type: 'undo' }).config.keymap).toBe(state.config.keymap);
  });

  it('records whole-config edits for undo', () => {
    const state = start();
    const config = { ...state.config, west: { ...state.config.west, zmkVersion: 'v0.2' } };
    const edited = run(state, { type: 'editConfig', config });
    expect(edited.config.west.zmkVersion).toBe('v0.2');
    expect(run(edited, { type: 'undo' }).config.west.zmkVersion).toBe('v0.3');
  });
});
