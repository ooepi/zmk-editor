import { useMemo } from 'react';
import { lineDiff, type DiffLine } from '../../core/github/diff.ts';

const CONTEXT = 2;

/** Changed lines with a little context; long unchanged runs are folded. */
export function DiffView({ before, after }: { before: string | undefined; after: string | undefined }) {
  const rows = useMemo(() => fold(lineDiff(before, after)), [before, after]);
  return (
    <pre className="diff" aria-label="Changes">
      {rows.map((row, i) =>
        row === null ? (
          <div key={i} className="diff-fold">
            ⋯
          </div>
        ) : (
          <div key={i} className={`diff-${row.kind}`}>
            {row.kind === 'added' ? '+ ' : row.kind === 'removed' ? '- ' : '  '}
            {row.text}
          </div>
        ),
      )}
    </pre>
  );
}

function fold(diff: DiffLine[]): (DiffLine | null)[] {
  const keep = diff.map((line, i) =>
    diff.slice(Math.max(0, i - CONTEXT), i + CONTEXT + 1).some((l) => l.kind !== 'same') || line.kind !== 'same',
  );
  const rows: (DiffLine | null)[] = [];
  diff.forEach((line, i) => {
    if (keep[i]) rows.push(line);
    else if (rows.at(-1) !== null) rows.push(null);
  });
  return rows;
}
