import { parse } from 'yaml';
import { isRecord, optionalString, yamlScalar } from './yaml-util.ts';

export interface BuildTarget {
  board: string;
  shield?: string;
  snippet?: string;
  cmakeArgs?: string;
  artifactName?: string;
}

/** `build.yaml`: the GitHub Actions build matrix. */
export interface BuildModel {
  include: BuildTarget[];
}

const FIELDS: [keyof BuildTarget, string][] = [
  ['board', 'board'],
  ['shield', 'shield'],
  ['snippet', 'snippet'],
  ['cmakeArgs', 'cmake-args'],
  ['artifactName', 'artifact-name'],
];

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(optionalString).filter((v): v is string => v !== undefined);
  const single = optionalString(value);
  return single ? [single] : [];
}

export function parseBuildMatrix(text: string): BuildModel {
  const doc: unknown = parse(text);
  if (!isRecord(doc)) return { include: [] };

  const include: BuildTarget[] = [];
  const boards = stringList(doc.board);
  const shields = stringList(doc.shield);
  for (const board of boards) {
    if (shields.length === 0) include.push({ board });
    for (const shield of shields) include.push({ board, shield });
  }
  for (const entry of Array.isArray(doc.include) ? doc.include : []) {
    if (!isRecord(entry)) continue;
    const board = optionalString(entry.board);
    if (!board) continue;
    const target: BuildTarget = { board };
    for (const [key, yamlKey] of FIELDS) {
      const value = optionalString(entry[yamlKey]);
      if (value !== undefined && key !== 'board') target[key] = value;
    }
    include.push(target);
  }
  return { include };
}

export function generateBuildMatrix(model: BuildModel): string {
  const lines = ['---', 'include:'];
  for (const target of model.include) {
    FIELDS.forEach(([key, yamlKey], index) => {
      const value = target[key];
      if (value === undefined) return;
      lines.push(`${index === 0 ? '  - ' : '    '}${yamlKey}: ${yamlScalar(value)}`);
    });
  }
  if (model.include.length === 0) lines[1] = 'include: []';
  return `${lines.join('\n')}\n`;
}
