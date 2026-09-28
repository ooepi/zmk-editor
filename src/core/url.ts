/**
 * The URL when it is an https link, otherwise undefined. For links built from
 * files or API data (a west.yml, a module's homepage), so a `javascript:` or
 * other odd address never ends up in an href.
 */
export function httpsUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}
