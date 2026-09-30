// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { useReducer } from 'react';
import { describe, expect, it } from 'vitest';
import { formatBinding } from '../../core/keymap/bindings.ts';
import { encodeKey } from '../../core/studio/usage.ts';
import { fakeDeviceFor, type FakeDevice } from '../studio/fakeDevice.ts';
import { demoConfig } from './demo.ts';
import { editorReducer, initialState } from './editorReducer.ts';
import { useStudioSession } from './studioSession.ts';

/** The editor (real reducer) with a Studio session on a fake keyboard flashed with the demo config. */
function setup({ locked = false, loadFromKeyboard = false, device = fakeDeviceFor(demoConfig().config, { locked }) } = {}) {
  const hook = renderHook(() => {
    const [state, dispatch] = useReducer(editorReducer, undefined, () => initialState(demoConfig().config));
    const studio = useStudioSession(state.config, dispatch, { open: async () => device, loadFromKeyboard });
    return { state, dispatch, studio };
  });
  return { ...hook, device };
}

const deviceKey = async (device: FakeDevice, layer: number, key: number) => (await device.keymap()).layers[layer]?.bindings[key];
const editorKey = (state: ReturnType<typeof setup>['result']['current']['state'], layer: number, key: number) =>
  formatBinding(state.config.keymap.layers[layer]?.bindings[key] ?? { behavior: '?', params: [] });
const kp = (key: string) => ({ behaviorId: 0, param1: encodeKey(key) ?? 0, param2: 0 });

async function connected(options?: Parameters<typeof setup>[0]) {
  const s = setup(options);
  await act(() => s.result.current.studio.connect());
  await waitFor(() => expect(s.result.current.studio.status.phase).toBe('connected'));
  return s;
}

describe('useStudioSession', () => {
  it('waits for the unlock key, then connects in sync with a matching config', async () => {
    const s = setup({ locked: true });
    let connecting!: Promise<void>;
    act(() => {
      connecting = s.result.current.studio.connect();
    });
    await waitFor(() => expect(s.result.current.studio.status.phase).toBe('locked'));
    act(() => s.device.unlock());
    await act(() => connecting);
    expect(s.result.current.studio.status.phase).toBe('connected');
    expect(s.result.current.studio.unsaved).toBe(false);
    expect(s.result.current.studio.deviceName).toBe('Fake Keyboard');
  });

  it('sends key edits live, and saves them', async () => {
    const s = await connected();
    act(() => s.result.current.dispatch({ type: 'placeOnKey', index: 0, item: { kind: 'keycode', token: 'X' } }));
    await waitFor(async () => expect((await deviceKey(s.device, 0, 0))?.param1).toBe(encodeKey('X')));
    await waitFor(() => expect(s.result.current.studio.unsaved).toBe(true));
    await act(() => s.result.current.studio.save());
    expect(s.result.current.studio.unsaved).toBe(false);
    // Undo sends the old key back.
    act(() => s.result.current.dispatch({ type: 'undo' }));
    await waitFor(async () => expect((await deviceKey(s.device, 0, 0))?.param1).not.toBe(encodeKey('X')));
  });

  it('shows a mismatch, and "send my config" makes the keyboard match', async () => {
    const device = fakeDeviceFor(demoConfig().config, { locked: false });
    const original = await deviceKey(device, 0, 0);
    await device.setBinding(0, 0, { ...kp('Q'), behaviorId: original?.behaviorId ?? 0 });
    await device.save();
    const s = setup({ device });
    await act(() => s.result.current.studio.connect());
    const status = s.result.current.studio.status;
    expect(status.phase).toBe('mismatch');
    expect(status.phase === 'mismatch' && status.comparison.summary).toBe('1 key on 1 layer');
    await act(() => s.result.current.studio.resolveMismatch('editor'));
    await waitFor(async () => expect(await deviceKey(device, 0, 0)).toEqual(original));
    expect(s.result.current.studio.status.phase).toBe('connected');
  });

  it('"bring the keyboard\'s keymap in" changes the editor, as one undoable step', async () => {
    const device = fakeDeviceFor(demoConfig().config, { locked: false });
    const original = await deviceKey(device, 0, 0);
    await device.setBinding(0, 0, { ...kp('Q'), behaviorId: original?.behaviorId ?? 0 });
    const s = setup({ device });
    const before = editorKey(s.result.current.state, 0, 0);
    await act(() => s.result.current.studio.connect());
    await act(() => s.result.current.studio.resolveMismatch('keyboard'));
    expect(editorKey(s.result.current.state, 0, 0)).toBe('&kp Q');
    act(() => s.result.current.dispatch({ type: 'undo' }));
    expect(editorKey(s.result.current.state, 0, 0)).toBe(before);
  });

  it('loads a Studio-only config straight from the keyboard', async () => {
    const s = await connected({ loadFromKeyboard: true });
    expect(s.result.current.state.config.studio).toEqual({ device: 'Fake Keyboard' });
    expect(s.result.current.state.config.keymap.layers.length).toBe(demoConfig().config.keymap.layers.length);
  });

  it('marks keys the keyboard cannot take as needing a build, and leaves the keyboard alone', async () => {
    const s = await connected();
    const before = await deviceKey(s.device, 0, 3);
    act(() => s.result.current.dispatch({ type: 'placeOnKey', index: 3, item: { kind: 'binding', binding: { behavior: 'no_such', params: [] } } }));
    await waitFor(() => expect(s.result.current.studio.needsBuild.has(`${s.result.current.state.config.keymap.layers[0]?.uid}:3`)).toBe(true));
    expect(await deviceKey(s.device, 0, 3)).toEqual(before);
  });

  it('pauses while the keyboard relocks, and sends the edit after the unlock key', async () => {
    const s = await connected();
    act(() => s.device.relock());
    act(() => s.result.current.dispatch({ type: 'placeOnKey', index: 1, item: { kind: 'keycode', token: 'Z' } }));
    await waitFor(() => expect(s.result.current.studio.status.phase).toBe('locked'));
    act(() => s.device.unlock());
    await waitFor(async () => expect((await deviceKey(s.device, 0, 1))?.param1).toBe(encodeKey('Z')));
    expect(s.result.current.studio.status.phase).toBe('connected');
  });

  it('keeps the editor as it is when the cable is pulled', async () => {
    const s = await connected();
    act(() => s.result.current.dispatch({ type: 'placeOnKey', index: 0, item: { kind: 'keycode', token: 'X' } }));
    act(() => s.device.pull());
    await waitFor(() => expect(s.result.current.studio.status).toEqual({ phase: 'idle', message: 'The keyboard was disconnected.' }));
    expect(editorKey(s.result.current.state, 0, 0)).toBe('&kp X');
  });

  it('discard reverts the keyboard and the editor; undo brings the change back', async () => {
    const s = await connected();
    const before = editorKey(s.result.current.state, 0, 0);
    act(() => s.result.current.dispatch({ type: 'placeOnKey', index: 0, item: { kind: 'keycode', token: 'X' } }));
    await waitFor(() => expect(s.result.current.studio.unsaved).toBe(true));
    await act(() => s.result.current.studio.discard());
    expect(editorKey(s.result.current.state, 0, 0)).toBe(before);
    expect(s.result.current.studio.unsaved).toBe(false);
    act(() => s.result.current.dispatch({ type: 'undo' }));
    expect(editorKey(s.result.current.state, 0, 0)).toBe('&kp X');
  });

  it('adds a layer on the keyboard from its spares', async () => {
    const s = await connected();
    const count = (await s.device.keymap()).layers.length;
    act(() => s.result.current.dispatch({ type: 'addLayer', name: 'Extra' }));
    await waitFor(async () => expect((await s.device.keymap()).layers.map((l) => l.name).at(-1)).toBe('Extra'));
    expect((await s.device.keymap()).layers).toHaveLength(count + 1);
  });
});

/** Counts the calls that change the keyboard. */
function counted(device: FakeDevice) {
  const writes: string[] = [];
  const wrap = <K extends 'setBinding' | 'addLayer' | 'removeLayer' | 'moveLayer' | 'renameLayer'>(name: K) => {
    const original = device[name].bind(device) as (...args: unknown[]) => Promise<unknown>;
    (device as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
      writes.push(name);
      return original(...args);
    };
  };
  (['setBinding', 'addLayer', 'removeLayer', 'moveLayer', 'renameLayer'] as const).forEach(wrap);
  return writes;
}

describe('review fixes', () => {
  it('loading from the keyboard writes nothing to it', async () => {
    const device = fakeDeviceFor({ ...demoConfig().config, studio: { device: 'Board' } }, { locked: false });
    const writes = counted(device);
    const s = await connected({ loadFromKeyboard: true, device });
    await act(async () => {});
    expect(writes).toEqual([]);
    expect(s.result.current.studio.unsaved).toBe(false);
  });

  it('bringing the keyboard keymap in writes nothing to it', async () => {
    const device = fakeDeviceFor(demoConfig().config, { locked: false });
    const original = await deviceKey(device, 0, 0);
    await device.setBinding(0, 0, { ...kp('Q'), behaviorId: original?.behaviorId ?? 0 });
    await device.save();
    const writes = counted(device);
    const s = setup({ device });
    await act(() => s.result.current.studio.connect());
    await act(() => s.result.current.studio.resolveMismatch('keyboard'));
    await act(async () => {});
    expect(writes).toEqual([]);
    expect(s.result.current.studio.unsaved).toBe(false);
  });

  it('an edit during discard still leaves the keyboard matching the editor', async () => {
    const s = await connected();
    act(() => s.result.current.dispatch({ type: 'placeOnKey', index: 0, item: { kind: 'keycode', token: 'X' } }));
    await waitFor(() => expect(s.result.current.studio.unsaved).toBe(true));
    let discarding!: Promise<void>;
    act(() => {
      discarding = s.result.current.studio.discard();
      s.result.current.dispatch({ type: 'placeOnKey', index: 2, item: { kind: 'keycode', token: 'Y' } });
    });
    await act(() => discarding);
    act(() => s.result.current.dispatch({ type: 'placeOnKey', index: 3, item: { kind: 'keycode', token: 'Z' } }));
    await waitFor(async () => expect((await deviceKey(s.device, 0, 3))?.param1).toBe(encodeKey('Z')));
    const keys = (await s.device.keymap()).layers[0]?.bindings ?? [];
    const editor = s.result.current.state.config.keymap.layers[0]?.bindings ?? [];
    expect(keys[0]?.param1 === encodeKey('X')).toBe(formatBinding(editor[0] ?? { behavior: '', params: [] }) === '&kp X');
    expect(keys[2]?.param1 === encodeKey('Y')).toBe(formatBinding(editor[2] ?? { behavior: '', params: [] }) === '&kp Y');
  });
});
