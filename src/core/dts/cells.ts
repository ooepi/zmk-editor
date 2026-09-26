/**
 * Splits the inside of `< … >` into tokens. Parenthesised expressions such
 * as `LA(LC(TAB))` or `( 1 + 2 )` stay whole.
 */
export function tokenizeCells(inner: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let depth = 0;
  for (const ch of inner) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && /\s/.test(ch)) {
      if (current) tokens.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}
