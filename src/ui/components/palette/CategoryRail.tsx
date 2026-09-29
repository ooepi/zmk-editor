export interface RailEntry {
  /** The section's id (its element is `palette-<id>`). */
  id: string;
  title: string;
  kind: 'Recent' | 'Keys' | 'Behaviors';
}

interface CategoryRailProps {
  entries: RailEntry[];
  /** The section in view, highlighted. */
  current: string | null;
  onJump: (id: string) => void;
}

/** The palette's table of contents: jumps to a section instead of hiding the others. */
export function CategoryRail({ entries, current, onJump }: CategoryRailProps) {
  return (
    <nav className="palette-rail" aria-label="Palette categories">
      {entries.map((entry, index) => (
        <div key={entry.id} className="palette-rail-item">
          {entry.kind !== 'Recent' && entry.kind !== entries[index - 1]?.kind && entry.title !== entry.kind && (
            <span className="palette-rail-heading" aria-hidden="true">
              {entry.kind}
            </span>
          )}
          <button
            type="button"
            className="palette-rail-button"
            aria-current={entry.id === current ? 'true' : undefined}
            onClick={() => onJump(entry.id)}
          >
            {entry.title}
          </button>
        </div>
      ))}
    </nav>
  );
}
