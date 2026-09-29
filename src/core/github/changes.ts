import { staleShieldFiles } from '../hardware/generate.ts';

/**
 * What a commit would change: every generated file that differs from the branch, and (as null)
 * shield files the editor generated earlier but no longer does.
 */
export function pendingChanges(generated: Record<string, string>, repoFiles: Record<string, string>, keyboard: string): [string, string | null][] {
  return [
    ...Object.entries(generated).filter(([path, text]) => repoFiles[path] !== text),
    ...staleShieldFiles(repoFiles, keyboard, generated).map((path): [string, null] => [path, null]),
  ];
}
