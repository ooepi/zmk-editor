/** Where the editor commits: kept in this browser only. */
export interface GitHubSettings {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

const STORAGE_KEY = 'zmk-editor.github.v1';

export function loadGitHubSettings(): GitHubSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GitHubSettings) : null;
  } catch {
    return null;
  }
}

/** `remember` keeps the token across browser restarts (localStorage); otherwise only for this tab. */
export function saveGitHubSettings(settings: GitHubSettings, remember: boolean): void {
  try {
    clearGitHubSettings();
    (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: settings last until the page closes.
  }
}

export function clearGitHubSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}
