import { unzipSync } from 'fflate';

export interface FirmwareFile {
  name: string;
  data: Uint8Array;
}

/** The `.uf2` files in an artifact zip, including ones inside nested zips. */
export function extractUf2(zip: Uint8Array): FirmwareFile[] {
  const files: FirmwareFile[] = [];
  for (const [path, data] of Object.entries(unzipSync(zip))) {
    const name = path.split('/').at(-1) ?? path;
    if (/\.uf2$/i.test(name)) files.push({ name, data });
    else if (/\.zip$/i.test(name)) files.push(...extractUf2(data));
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}
