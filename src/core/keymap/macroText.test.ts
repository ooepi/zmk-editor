import { describe, expect, it } from 'vitest';
import { formatBinding } from './bindings.ts';
import { textToBindings } from './macroText.ts';

describe('textToBindings', () => {
  it('types letters, capitals, digits, spaces and symbols', () => {
    const { bindings, unsupported } = textToBindings('Hi 2!');
    expect(bindings.map(formatBinding)).toEqual(['&kp LS(H)', '&kp I', '&kp SPACE', '&kp N2', '&kp EXCL']);
    expect(unsupported).toEqual([]);
  });

  it('reports characters it cannot type', () => {
    const { bindings, unsupported } = textToBindings('aäb');
    expect(bindings.map(formatBinding)).toEqual(['&kp A', '&kp B']);
    expect(unsupported).toEqual(['ä']);
  });

  it('handles newlines and tabs', () => {
    expect(textToBindings('a\n\tb').bindings.map(formatBinding)).toEqual(['&kp A', '&kp ENTER', '&kp TAB', '&kp B']);
  });
});
