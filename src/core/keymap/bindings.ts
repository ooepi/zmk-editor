import type { DtValue } from '../dts/ast.ts';
import type { Binding } from './model.ts';

/** Splits cell tokens into bindings at each `&reference`; null if they aren't bindings. */
export function parseBindings(tokens: string[]): Binding[] | null {
  const bindings: Binding[] = [];
  for (const token of tokens) {
    if (token.startsWith('&')) bindings.push({ behavior: token.slice(1), params: [] });
    else {
      const last = bindings.at(-1);
      if (!last) return null;
      last.params.push(token);
    }
  }
  return bindings;
}

/** Bindings from a property's values; all values must be cell lists. */
export function bindingsFromValues(values: DtValue[]): Binding[] | null {
  const tokens: string[] = [];
  for (const value of values) {
    if (value.kind !== 'cells') return null;
    tokens.push(...value.tokens);
  }
  return parseBindings(tokens);
}

export function formatBinding(binding: Binding): string {
  return [`&${binding.behavior}`, ...binding.params].join(' ');
}
