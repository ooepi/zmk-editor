import { CONTROLLER_DATA, type ControllerData } from '../catalog/keyboards.data.ts';
import { INTERCONNECTS } from './interconnects.ts';

/** Wireless nRF52840 controllers with a footprint the wizard knows (Pro Micro, Seeed XIAO). */
export const HARDWARE_CONTROLLERS: ControllerData[] = CONTROLLER_DATA.filter(
  (c) => c.ble && !c.id.endsWith('_52833') && c.exposes.some((e) => INTERCONNECTS.some((ic) => ic.id === e)),
);
