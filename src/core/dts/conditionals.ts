const DIRECTIVE = /^\s*#\s*(ifdef|ifndef|if|elif|else|endif|define|undef)\b\s*(.*)$/;

type Frame = { kind: 'pass' } | { kind: 'resolved'; parentActive: boolean; taken: boolean; active: boolean };

/**
 * Evaluates `#ifdef` / `#if defined(…)` blocks that appear *inside* nodes,
 * keeping only the active branch (inactive lines become blank, so offsets
 * stay). Conditionals at the top level are left alone; they round-trip as
 * directives. Returns the input unchanged if a condition can't be evaluated.
 * Expects text with comments already stripped.
 */
export function resolveConditionals(text: string): { text: string; resolved: boolean } {
  const defined = new Set<string>();
  const stack: Frame[] = [];
  let depth = 0;
  let resolved = false;
  const isActive = () => stack.every((f) => f.kind === 'pass' || f.active);

  const evaluate = (kind: string, expr: string): boolean | null => {
    const e = expr.trim();
    if (kind === 'ifdef') return defined.has(e);
    if (kind === 'ifndef') return !defined.has(e);
    const d = /^(!)?\s*defined\s*\(?\s*(\w+)\s*\)?$/.exec(e);
    if (d?.[2]) return d[1] ? !defined.has(d[2]) : defined.has(d[2]);
    if (/^\d+$/.test(e)) return Number(e) !== 0;
    return null;
  };

  const out: string[] = [];
  for (const line of text.split('\n')) {
    const m = DIRECTIVE.exec(line);
    const blank = ' '.repeat(line.length);
    if (m) {
      const [, kind = '', rest = ''] = m;
      const top = stack.at(-1);
      if (kind === 'define' || kind === 'undef') {
        const name = /^(\w+)/.exec(rest)?.[1];
        if (name && isActive()) {
          if (kind === 'define') defined.add(name);
          else defined.delete(name);
        }
        out.push(isActive() ? line : blank);
        continue;
      }
      if (kind === 'ifdef' || kind === 'ifndef' || kind === 'if') {
        if (depth === 0) {
          stack.push({ kind: 'pass' });
          out.push(line);
          continue;
        }
        const value = evaluate(kind, rest);
        if (value === null) return { text, resolved: false };
        const parentActive = isActive();
        stack.push({ kind: 'resolved', parentActive, taken: value, active: parentActive && value });
        resolved = true;
        out.push(blank);
        continue;
      }
      if (!top) return { text, resolved: false };
      if (top.kind === 'pass') {
        if (kind === 'endif') stack.pop();
        out.push(line);
        continue;
      }
      if (kind === 'endif') stack.pop();
      else if (kind === 'else') {
        top.active = top.parentActive && !top.taken;
        top.taken = true;
      } else {
        const value = evaluate('if', rest);
        if (value === null) return { text, resolved: false };
        top.active = top.parentActive && !top.taken && value;
        top.taken ||= value;
      }
      out.push(blank);
      continue;
    }
    if (!isActive()) {
      out.push(blank);
      continue;
    }
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth = Math.max(0, depth - 1);
    }
    out.push(line);
  }
  return { text: out.join('\n'), resolved };
}
