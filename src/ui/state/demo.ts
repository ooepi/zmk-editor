import { importConfig, type ZmkConfig } from '../../core/config.ts';
import keymap from '../../../test/fixtures/lily58/lily58.keymap?raw';
import kconfig from '../../../test/fixtures/lily58/lily58.conf?raw';
import west from '../../../test/fixtures/lily58/west.yml?raw';
import build from '../../../test/fixtures/lily58/build.yaml?raw';

/** The Lily58 config the editor starts with before you load your own. */
export function demoConfig(): { config: ZmkConfig; warnings: string[] } {
  return importConfig({
    'config/lily58.keymap': keymap,
    'config/lily58.conf': kconfig,
    'config/west.yml': west,
    'build.yaml': build,
  });
}
