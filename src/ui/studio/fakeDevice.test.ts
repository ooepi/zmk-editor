import { describe, expect, it, vi } from 'vitest';
import { demoConfig } from '../state/demo.ts';
import { DisconnectedError, LockedError, RejectedError } from './device.ts';
import { createFakeDevice, fakeDeviceFor } from './fakeDevice.ts';

const kp = { behaviorId: 1, param1: 0x070004, param2: 0 };

describe('createFakeDevice', () => {
  const make = (locked = false) =>
    createFakeDevice({
      name: 'Fake',
      locked,
      behaviors: [{ id: 1, name: 'Key Press', cells: ['keycode', 'none'] }],
      layers: [{ id: 0, name: 'Base', bindings: [kp, kp] }],
      spare: 1,
      layout: { name: 'Default', keys: [] },
    });

  it('refuses keymap calls while locked, until the unlock key is pressed', async () => {
    const device = make(true);
    const seen = vi.fn();
    device.onNotification(seen);
    await expect(device.keymap()).rejects.toBeInstanceOf(LockedError);
    expect(await device.name()).toBe('Fake');
    device.unlock();
    expect(seen).toHaveBeenCalledWith({ kind: 'lock', locked: false });
    expect((await device.keymap()).layers).toHaveLength(1);
  });

  it('applies changes live, and saves or discards them', async () => {
    const device = make();
    const seen = vi.fn();
    device.onNotification(seen);
    await device.setBinding(0, 1, { behaviorId: 1, param1: 0x070005, param2: 0 });
    expect(seen).toHaveBeenCalledWith({ kind: 'unsaved', unsaved: true });
    expect(await device.hasUnsavedChanges()).toBe(true);
    await device.discard();
    expect((await device.keymap()).layers[0]?.bindings[1]).toEqual(kp);
    await device.renameLayer(0, 'Main');
    await device.save();
    expect(await device.hasUnsavedChanges()).toBe(false);
    await device.discard();
    expect((await device.keymap()).layers[0]?.name).toBe('Main');
  });

  it('adds layers from its spares, and rejects what it does not have', async () => {
    const device = make();
    const id = await device.addLayer();
    expect((await device.keymap()).layers.map((l) => l.id)).toEqual([0, id]);
    await expect(device.addLayer()).rejects.toBeInstanceOf(RejectedError);
    await expect(device.setBinding(0, 0, { behaviorId: 9, param1: 0, param2: 0 })).rejects.toBeInstanceOf(RejectedError);
    await device.removeLayer(1);
    expect((await device.keymap()).availableLayers).toBe(1);
  });

  it('tells listeners when it is unplugged, then fails every call', async () => {
    const device = make();
    const closed = vi.fn();
    device.onClose(closed);
    device.pull();
    expect(closed).toHaveBeenCalledOnce();
    await expect(device.keymap()).rejects.toBeInstanceOf(DisconnectedError);
  });
});

describe('fakeDeviceFor', () => {
  it('mirrors a config: its layers, a behavior per built-in and its layout', async () => {
    const { config } = demoConfig();
    const device = fakeDeviceFor(config, { locked: false });
    const keymap = await device.keymap();
    expect(keymap.layers.map((l) => l.name)).toEqual(config.keymap.layers.map((l) => l.displayName ?? l.name));
    expect(keymap.layers[0]?.bindings).toHaveLength(config.keymap.layers[0]?.bindings.length ?? 0);
    expect((await device.behaviors()).some((b) => b.name === 'Key Press')).toBe(true);
    expect((await device.layouts()).layouts[0]?.keys.length).toBe(58);
  });
});
