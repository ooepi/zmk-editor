import { MODIFIER_FUNCTIONS, type ModifierFunction } from '../../../core/catalog/keycodes.ts';

interface ModifierBarProps {
  mods: ModifierFunction[];
  onToggle: (mod: ModifierFunction) => void;
  onClear: () => void;
}

/** Modifiers to hold with placed keys; while any is on the bar says so, next to the tiles it changes. */
export function ModifierBar({ mods, onToggle, onClear }: ModifierBarProps) {
  const active = mods.length > 0;
  const labels = MODIFIER_FUNCTIONS.filter((m) => mods.includes(m.id))
    .map((m) => m.label)
    .join('+');
  return (
    <div className={`palette-mods${active ? ' active' : ''}`}>
      <span className="palette-mods-label" id="palette-mods-label">
        Add modifiers
      </span>
      <div className="mod-toggles" role="group" aria-labelledby="palette-mods-label">
        {MODIFIER_FUNCTIONS.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`mod-toggle${mods.includes(m.id) ? ' active' : ''}`}
            aria-pressed={mods.includes(m.id)}
            aria-label={`Hold ${m.name} with placed keys`}
            title={`Hold ${m.name} with the placed key (${m.id})`}
            onClick={() => onToggle(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      {active && (
        <>
          <span className="palette-mods-summary">Key tiles will send {labels} with the key.</span>
          <button type="button" className="link-button" onClick={onClear}>
            Clear modifiers
          </button>
        </>
      )}
    </div>
  );
}
