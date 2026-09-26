export interface DiffLine {
  kind: 'same' | 'added' | 'removed';
  text: string;
}

const lines = (text: string | undefined) => {
  if (!text) return [];
  const list = text.split('\n');
  if (list.at(-1) === '') list.pop();
  return list;
};

/** A line diff (longest common subsequence); fine for config-sized files. */
export function lineDiff(before: string | undefined, after: string | undefined): DiffLine[] {
  const a = lines(before);
  const b = lines(after);
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = lcs[i] as number[];
      row[j] = a[i] === b[j] ? (lcs[i + 1]?.[j + 1] ?? 0) + 1 : Math.max(lcs[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] ?? '' });
      i++;
      j++;
    } else if ((lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0)) {
      out.push({ kind: 'removed', text: a[i++] ?? '' });
    } else {
      out.push({ kind: 'added', text: b[j++] ?? '' });
    }
  }
  while (i < a.length) out.push({ kind: 'removed', text: a[i++] ?? '' });
  while (j < b.length) out.push({ kind: 'added', text: b[j++] ?? '' });
  return out;
}

export function diffStats(diff: DiffLine[]): { added: number; removed: number } {
  return {
    added: diff.filter((l) => l.kind === 'added').length,
    removed: diff.filter((l) => l.kind === 'removed').length,
  };
}
