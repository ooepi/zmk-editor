/** A generic devicetree value, as written in the source. */
export type DtValue =
  | { kind: 'cells'; tokens: string[] }
  | { kind: 'string'; value: string }
  | { kind: 'bytes'; tokens: string[] }
  | { kind: 'ref'; target: string };

/** A property; an empty `values` list is a boolean property (`name;`). */
export interface DtProperty {
  name: string;
  values: DtValue[];
}

export interface DtNode {
  name: string;
  labels: string[];
  properties: DtProperty[];
  children: DtNode[];
}

/** Something outside the root node, kept in source order. */
export type TopLevelItem =
  | { kind: 'include'; path: string; system: boolean }
  | { kind: 'define'; name: string; params?: string[]; value: string }
  | { kind: 'directive'; text: string }
  | { kind: 'override'; node: DtNode }
  | { kind: 'raw'; text: string };

export interface DtDocument {
  items: TopLevelItem[];
  /** All `/ { … }` blocks merged into one, or null if there were none. */
  root: DtNode | null;
}
