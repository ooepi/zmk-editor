import { useMemo } from 'react';
import { behaviorSection, behaviorSummary } from '../../../core/keymap/behaviorSummary.ts';
import type { Behavior, KeymapModel } from '../../../core/keymap/model.ts';
import { Icon } from '../Icon.tsx';
import { KIND_LOOK, SECTION_ORDER, type ListSection } from './kinds.ts';

interface BehaviorListProps {
  keymap: KeymapModel;
  /** The behaviors (or macros) to list. */
  behaviors: Behavior[];
  macros: boolean;
  selected: string | null;
  onSelect: (label: string | null) => void;
  /** The empty state's button: open the New behavior dialog, or make a macro. */
  onCreate: () => void;
}

/** Behaviors grouped by kind, each with a coloured header; macros as one list. */
export function BehaviorList({ keymap, behaviors, macros, selected, onSelect, onCreate }: BehaviorListProps) {
  const groups = useMemo(() => {
    const sections: ListSection[] = macros ? ['macro'] : SECTION_ORDER;
    return sections
      .map((section) => ({
        section,
        items: macros ? behaviors : behaviors.filter((b) => behaviorSection(b) === section),
      }))
      .filter((g) => g.items.length > 0);
  }, [behaviors, macros]);

  if (behaviors.length === 0) {
    return (
      <div className="behavior-empty">
        <span className={`kind-disc kind-tone-${macros ? 'macro' : 'holdtap'}`}>
          <Icon name={macros ? 'listOrdered' : 'sliders'} size={22} />
        </span>
        <p className="muted small">
          {macros
            ? 'A macro types a sequence of keys, like a word or a shortcut chain.'
            : 'Behaviors give one key more than one job: tap or hold, with a modifier, or a different key per number of taps.'}
        </p>
        <button type="button" className="button primary" onClick={onCreate}>
          {macros ? 'Create your first macro' : 'Create your first behavior'}
        </button>
      </div>
    );
  }

  return (
    <div className="behavior-groups">
      {groups.map(({ section, items }) => {
        const look = KIND_LOOK[section];
        const headingId = `behavior-section-${section}`;
        return (
          <section key={section} className={`behavior-group kind-tone-${look.tone}`} aria-labelledby={headingId}>
            <h3 id={headingId} className={`behavior-group-head${macros ? ' sr-only' : ''}`}>
              <span className="kind-disc small">
                <Icon name={look.icon} size={14} />
              </span>
              <span className="grow">{look.title}</span>
              <span className="badge">{items.length}</span>
            </h3>
            <ul className="item-list" aria-label={look.title}>
              {items.map((b) => (
                <li key={b.label ?? b.name}>
                  <button
                    type="button"
                    className={`item behavior-item${b.label === selected ? ' active' : ''}`}
                    aria-pressed={b.label === selected}
                    onClick={() => onSelect(b.label ?? null)}
                  >
                    <span className="kind-dot" aria-hidden="true" />
                    <span className="behavior-item-text">
                      <span className="mono behavior-item-name">&amp;{b.label ?? b.name}</span>
                      <span className="behavior-item-summary">{behaviorSummary(b, keymap)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
