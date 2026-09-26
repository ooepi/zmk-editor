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

  it('never deletes the last layer', () => {
    let state = start();
    for (let i = 0; i < 6; i++) state = run(state, { type: 'deleteLayer', index: 0 });
    expect(state.config.keymap.layers).toHaveLength(1);
  });
});
