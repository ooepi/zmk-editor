import { describe, expect, it } from 'vitest';
import { httpsUrl } from './url.ts';

describe('httpsUrl', () => {
  it('keeps https links', () => {
    expect(httpsUrl('https://github.com/zmkfirmware/zmk')).toBe('https://github.com/zmkfirmware/zmk');
  });

  it('drops anything else', () => {
    expect(httpsUrl('javascript:alert(1)//x')).toBeUndefined();
    expect(httpsUrl('JaVaScRiPt:alert(1)')).toBeUndefined();
    expect(httpsUrl('data:text/html,<script>1</script>')).toBeUndefined();
    expect(httpsUrl('http://example.com')).toBeUndefined();
    expect(httpsUrl('not a url')).toBeUndefined();
    expect(httpsUrl(undefined)).toBeUndefined();
  });
});
