import { parse } from 'yaml';

/** A YAML scalar: plain when it reads back as the same string, otherwise double-quoted. */
export function yamlScalar(value: string): string {
  const safe = /^[A-Za-z0-9_./-][A-Za-z0-9_ ./=+:-]*$/.test(value) && !/:\s|:$|\s$|^-\s/.test(value);
  return safe && parse(value) === value ? value : JSON.stringify(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function optionalString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}
