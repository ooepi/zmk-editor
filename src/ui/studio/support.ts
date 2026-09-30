import type { ZmkConfig } from '../../core/config.ts';
import type { StudioDevice } from './device.ts';

/** Web Serial is in Chromium browsers on desktop only. */
export const serialSupported = () => typeof navigator !== 'undefined' && 'serial' in navigator;

/** `?studio=fake` in development: a pretend keyboard, to try Studio without one. */
export const fakeStudioRequested = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get('studio') === 'fake';

/**
 * Opens a keyboard: the real one over Web Serial (the client library loads only then), or in
 * development with `?studio=fake`, a pretend keyboard flashed with `config` that unlocks itself.
 */
export async function openKeyboard(config: ZmkConfig): Promise<StudioDevice> {
  if (fakeStudioRequested()) {
    const { fakeDeviceFor } = await import('./fakeDevice.ts');
    const device = fakeDeviceFor(config.studio ? config : { ...config, studio: { device: 'Fake Keyboard' } });
    window.setTimeout(() => device.unlock(), 2500);
    return device;
  }
  return (await import('./realDevice.ts')).connectSerialDevice();
}
