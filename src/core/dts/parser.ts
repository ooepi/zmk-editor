import type { DtDocument, DtNode, DtProperty, DtValue, TopLevelItem } from './ast.ts';
import { tokenizeCells } from './cells.ts';
import { stripComments } from './comments.ts';

class DtsSyntaxError extends Error {}

const NAME_CHAR = /[A-Za-z0-9,._+\-#@?]/;

/**
 * Best-effort devicetree parser for ZMK keymaps. Anything outside the
 * supported subset becomes a `raw` item, so nothing is lost.
 */
export function parseDts(text: string): DtDocument {
  return new Parser(stripComments(text)).parseDocument();
}

class Parser {
  private pos = 0;
  private readonly s: string;

  constructor(s: string) {
    this.s = s;
  }

  parseDocument(): DtDocument {
    const items: TopLevelItem[] = [];
    let root: DtNode | null = null;
    for (;;) {
      this.skipWs();
      if (this.eof()) break;
      const start = this.pos;
      const ch = this.s[this.pos];
      if (ch === '#') {
        items.push(this.readDirective());
        continue;
      }
      try {
        if (ch === '/' && this.peekAfter(1) === '{') {
          this.pos++;
          this.skipWs();
          const node = this.parseNodeBody('/', []);
          root = root ? mergeNodes(root, node) : node;
          continue;
        }
        if (ch === '&') {
          this.pos++;
          const name = this.readName();
          this.skipWs();
          if (this.s[this.pos] === '{') {
            items.push({ kind: 'override', node: this.parseNodeBody(`&${name}`, []) });
            continue;
          }
        }
      } catch (error) {
        if (!(error instanceof DtsSyntaxError)) throw error;
      }
      this.pos = start;
      items.push({ kind: 'raw', text: this.readRawStatement() });
    }
    return { items, root };
  }

  private eof(): boolean {
    return this.pos >= this.s.length;
  }

  private skipWs(): void {
    while (!this.eof() && /\s/.test(this.s[this.pos] ?? '')) this.pos++;
  }

  /** The first non-whitespace character `offset` characters ahead. */
  private peekAfter(offset: number): string | undefined {
    let i = this.pos + offset;
    while (i < this.s.length && /\s/.test(this.s[i] ?? '')) i++;
    return this.s[i];
  }

  private expect(ch: string): void {
    this.skipWs();
    if (this.s[this.pos] !== ch) throw new DtsSyntaxError(`Expected '${ch}' at ${this.pos}`);
    this.pos++;
  }

  private readName(): string {
    const start = this.pos;
    while (!this.eof() && NAME_CHAR.test(this.s[this.pos] ?? '')) this.pos++;
    if (this.pos === start) throw new DtsSyntaxError(`Expected a name at ${this.pos}`);
    return this.s.slice(start, this.pos);
  }

  /** Reads one preprocessor line, joining `\`-continued lines. */
  private readDirective(): TopLevelItem {
    const start = this.pos;
    while (!this.eof()) {
      const nl = this.s.indexOf('\n', this.pos);
      if (nl === -1) {
        this.pos = this.s.length;
        break;
      }
      this.pos = nl + 1;
      if (!/\\\s*$/.test(this.s.slice(start, nl))) break;
    }
    const text = trimLines(this.s.slice(start, this.pos));

    const include = /^#\s*include\s*([<"])([^>"]+)[>"]$/.exec(text);
    if (include?.[2]) return { kind: 'include', path: include[2], system: include[1] === '<' };

    const define = /^#\s*define\s+([A-Za-z_]\w*)(\(([^)]*)\))?(?:\s+([\s\S]*))?$/.exec(text);
    if (define?.[1]) {
      const item: TopLevelItem = { kind: 'define', name: define[1], value: (define[4] ?? '').trim() };
      if (define[2] !== undefined) {
        item.params = (define[3] ?? '')
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);
      }
      return item;
    }
    return { kind: 'directive', text };
  }

  /**
   * Reads a statement we don't model: up to a `;` at depth 0, or the end of a
   * balanced `( … )` / `{ … }` group (plus an optional `;`).
   */
  private readRawStatement(): string {
    const start = this.pos;
    let depth = 0;
    while (!this.eof()) {
      const ch = this.s[this.pos];
      if (ch === '"') {
        this.skipString();
        continue;
      }
      this.pos++;
      if (ch === '(' || ch === '{' || ch === '[') depth++;
      else if (ch === ')' || ch === '}' || ch === ']') {
        depth--;
        if (depth <= 0) {
          const save = this.pos;
          while (this.s[this.pos] === ' ' || this.s[this.pos] === '\t') this.pos++;
          if (this.s[this.pos] === ';') this.pos++;
          else this.pos = save;
          break;
        }
      } else if (ch === ';' && depth === 0) break;
    }
    return trimLines(this.s.slice(start, this.pos));
  }

  private skipString(): void {
    this.pos++;
    while (!this.eof() && this.s[this.pos] !== '"') this.pos += this.s[this.pos] === '\\' ? 2 : 1;
    this.pos++;
  }

  private parseNodeBody(name: string, labels: string[]): DtNode {
    const node: DtNode = { name, labels, properties: [], children: [] };
    this.expect('{');
    for (;;) {
      this.skipWs();
      if (this.eof()) throw new DtsSyntaxError('Unterminated node');
      if (this.s[this.pos] === '}') {
        this.pos++;
        this.expect(';');
        return node;
      }
      const childLabels: string[] = [];
      let childName = this.readName();
      this.skipWs();
      while (this.s[this.pos] === ':') {
        childLabels.push(childName);
        this.pos++;
        this.skipWs();
        childName = this.readName();
        this.skipWs();
      }
      const next = this.s[this.pos];
      if (next === '{') {
        node.children.push(this.parseNodeBody(childName, childLabels));
      } else if (childLabels.length > 0) {
        throw new DtsSyntaxError(`Labels on a property at ${this.pos}`);
      } else if (next === ';') {
        this.pos++;
        node.properties.push({ name: childName, values: [] });
      } else if (next === '=') {
        this.pos++;
        node.properties.push(this.parseProperty(childName));
      } else {
        throw new DtsSyntaxError(`Unexpected '${next ?? 'EOF'}' at ${this.pos}`);
      }
    }
  }

  private parseProperty(name: string): DtProperty {
    const values: DtValue[] = [];
    for (;;) {
      this.skipWs();
      values.push(this.parseValue());
      this.skipWs();
      if (this.s[this.pos] !== ',') break;
      this.pos++;
    }
    this.expect(';');
    return { name, values };
  }

  private parseValue(): DtValue {
    const ch = this.s[this.pos];
    if (ch === '"') {
      const start = this.pos + 1;
      this.skipString();
      return { kind: 'string', value: this.s.slice(start, this.pos - 1) };
    }
    if (ch === '<') {
      const start = ++this.pos;
      let depth = 0;
      while (!this.eof() && !(this.s[this.pos] === '>' && depth === 0)) {
        if (this.s[this.pos] === '(') depth++;
        else if (this.s[this.pos] === ')') depth--;
        this.pos++;
      }
      if (this.eof()) throw new DtsSyntaxError('Unterminated cell list');
      const inner = this.s.slice(start, this.pos);
      this.pos++;
      return { kind: 'cells', tokens: tokenizeCells(inner) };
    }
    if (ch === '[') {
      const end = this.s.indexOf(']', this.pos);
      if (end === -1) throw new DtsSyntaxError('Unterminated byte list');
      const inner = this.s.slice(this.pos + 1, end);
      this.pos = end + 1;
      return { kind: 'bytes', tokens: inner.split(/\s+/).filter(Boolean) };
    }
    if (ch === '&') {
      this.pos++;
      return { kind: 'ref', target: this.readName() };
    }
    throw new DtsSyntaxError(`Unexpected value '${ch ?? 'EOF'}' at ${this.pos}`);
  }
}

/** Trims trailing whitespace on every line (stripped comments leave spaces behind) and the whole text. */
function trimLines(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

/** Merges `b` into `a` like dtc does: later properties win, same-named children merge. */
export function mergeNodes(a: DtNode, b: DtNode): DtNode {
  const properties = [...a.properties];
  for (const property of b.properties) {
    const index = properties.findIndex((p) => p.name === property.name);
    if (index === -1) properties.push(property);
    else properties[index] = property;
  }
  const children = [...a.children];
  for (const child of b.children) {
    const index = children.findIndex((c) => c.name === child.name);
    const existing = children[index];
    if (existing) children[index] = mergeNodes(existing, child);
    else children.push(child);
  }
  return { name: a.name, labels: [...new Set([...a.labels, ...b.labels])], properties, children };
}
