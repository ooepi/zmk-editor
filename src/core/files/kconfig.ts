export type KconfigLine =
  | { kind: 'set'; name: string; value: string }
  | { kind: 'comment'; text: string }
  | { kind: 'blank' }
  | { kind: 'raw'; text: string };

/** A `.conf` file, line by line, so commented-out options survive. */
export interface KconfigModel {
  lines: KconfigLine[];
}

export function parseKconfig(text: string): KconfigModel {
  const lines = text.split(/\r?\n/).map((raw): KconfigLine => {
    const line = raw.trim();
    if (!line) return { kind: 'blank' };
    if (line.startsWith('#')) return { kind: 'comment', text: line };
    const set = /^(CONFIG_\w+)\s*=\s*(.*)$/.exec(line);
    if (set?.[1] && set[2] !== undefined) return { kind: 'set', name: set[1], value: set[2] };
    return { kind: 'raw', text: line };
  });
  while (lines.at(-1)?.kind === 'blank') lines.pop();
  return { lines };
}

export function generateKconfig(model: KconfigModel): string {
  const text = model.lines
    .map((line) => {
      switch (line.kind) {
        case 'set':
          return `${line.name}=${line.value}`;
        case 'comment':
        case 'raw':
          return line.text;
        case 'blank':
          return '';
      }
    })
    .join('\n');
  return text ? `${text}\n` : '';
}
