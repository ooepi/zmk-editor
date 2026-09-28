import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { BEHAVIOR_GROUPS, searchBehaviors, type BehaviorDef } from '../../core/catalog/behaviors.ts';

interface BehaviorSelectProps {
  /** The current behavior ref, e.g. `kp`. */
  value: string;
  /** The behaviors on offer, in catalog order. */
  options: BehaviorDef[];
  label: string;
  onChange: (ref: string) => void;
}

const optionLabel = (def: BehaviorDef) => (def.behavior ? `&${def.ref}` : def.name);

/**
 * A searchable behavior field: shows the current behavior; typing or opening
 * it lists the matching behaviors by group, with their descriptions.
 */
export function BehaviorSelect({ value, options, label, onChange }: BehaviorSelectProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const current = options.find((d) => d.ref === value);
  const matches = useMemo(() => searchBehaviors(options, query), [options, query]);
  // Without a query the list is grouped, so it is shown (and navigated) in group order.
  const shown = useMemo(
    () => (query.trim() ? matches : BEHAVIOR_GROUPS.flatMap((g) => matches.filter((d) => d.group === g.id))),
    [matches, query],
  );

  const show = () => {
    setQuery('');
    setActive(Math.max(0, shown.findIndex((d) => d.ref === value)));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const choose = (def: BehaviorDef | undefined) => {
    if (def && def.ref !== value) onChange(def.ref);
    close();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) return show();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => Math.min(Math.max(i + step, 0), shown.length - 1));
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      choose(shown[active]);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  const optionId = (index: number) => `${id}-option-${index}`;
  const renderOption = (def: BehaviorDef) => {
    const index = shown.indexOf(def);
    return (
      <li
        key={def.ref}
        id={optionId(index)}
        role="option"
        aria-selected={index === active}
        className={`behavior-option${index === active ? ' active' : ''}${def.ref === value ? ' current' : ''}`}
        // Keep focus in the input so the click lands before the list closes.
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => setActive(index)}
        onClick={() => choose(def)}
      >
        <span className="behavior-option-name">{optionLabel(def)}</span>
        <span className="behavior-option-description">{def.description}</span>
      </li>
    );
  };

  return (
    <div className="behavior-select">
      <input
        className="input"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? optionId(active) : undefined}
        placeholder={open ? 'Search behaviors…' : undefined}
        value={open ? query : current ? optionLabel(current) : `&${value}`}
        spellCheck={false}
        onClick={() => (open ? close() : show())}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={close}
      />
      {open && (
        <ul className="behavior-list" id={`${id}-list`} role="listbox" aria-label={label}>
          {shown.length === 0 && <li className="muted small behavior-empty">No behaviors match.</li>}
          {query.trim()
            ? shown.map(renderOption)
            : BEHAVIOR_GROUPS.map((group) => {
                const inGroup = shown.filter((d) => d.group === group.id);
                if (inGroup.length === 0) return null;
                return (
                  <li key={group.id} role="presentation">
                    <div className="behavior-group-title" id={`${id}-${group.id}`}>
                      {group.label}
                    </div>
                    <ul role="group" aria-labelledby={`${id}-${group.id}`}>
                      {inGroup.map(renderOption)}
                    </ul>
                  </li>
                );
              })}
        </ul>
      )}
    </div>
  );
}
