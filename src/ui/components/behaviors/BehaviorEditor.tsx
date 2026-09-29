import { propertySchema } from '../../../core/catalog/properties.ts';
import { validLabel } from '../../../core/keymap/behaviorEdit.ts';
import { behaviorSection, kindLabel } from '../../../core/keymap/behaviorSummary.ts';
import { behaviorSource } from '../../../core/keymap/behaviorSource.ts';
import { behaviorKind, type Behavior, type KeymapModel } from '../../../core/keymap/model.ts';
import { Icon } from '../Icon.tsx';
import { LabelField } from '../LabelField.tsx';
import { MacroSteps } from '../MacroSteps.tsx';
import { AdaptiveKeyEditor, LeaderKeyEditor, SourceEditor, TriStateBindings } from '../ModuleBehaviorEditors.tsx';
import { PropertyFields } from '../PropertyFields.tsx';
import { IconButton } from '../ui/IconButton.tsx';
import { EncoderDiagram } from './EncoderDiagram.tsx';
import { HoldTapDiagram } from './HoldTapDiagram.tsx';
import { HOLD_TAP_DIAGRAM_PROPERTIES, KIND_LOOK, MOD_MORPH_DIAGRAM_PROPERTIES } from './kinds.ts';
import { ModMorphDiagram } from './ModMorphDiagram.tsx';
import { TapDanceDiagram } from './TapDanceDiagram.tsx';

interface BehaviorEditorProps {
  keymap: KeymapModel;
  behavior: Behavior;
  label: string;
  onChange: (behavior: Behavior) => void;
  onRename: (label: string) => void;
  onDelete: () => void;
  /** Show the palette section where this behavior can be placed. */
  onShowInPalette: (section: string) => void;
}

/** Properties the diagrams edit themselves, by kind. Everything else is listed below them. */
const IN_DIAGRAM: Partial<Record<string, string[]>> = {
  'hold-tap': HOLD_TAP_DIAGRAM_PROPERTIES,
  'mod-morph': MOD_MORPH_DIAGRAM_PROPERTIES,
};

/** A header card, then a diagram of what the behavior does, then its remaining settings. */
export function BehaviorEditor({ keymap, behavior, label, onChange, onRename, onDelete, onShowInPalette }: BehaviorEditorProps) {
  const kind = behaviorKind(behavior);
  const look = KIND_LOOK[kind === 'macro' ? 'macro' : behaviorSection(behavior)];
  const shown = IN_DIAGRAM[kind] ?? [];
  const rest = (propertySchema(behavior.compatible) ?? []).filter((s) => !shown.includes(s.name));
  const onProperties = (properties: Behavior['properties']) => onChange({ ...behavior, properties });
  // Tap-dance has just its tapping term, which people do change; the others' extras are for fine-tuning.
  const tucked = kind === 'hold-tap' || kind === 'mod-morph' || kind === 'macro' || kind === 'sensor-rotate';
  const encoder = kind === 'sensor-rotate';

  return (
    <div className={`behavior-editor kind-tone-${look.tone}`}>
      <header className="behavior-head">
        <span className="kind-disc large">
          <Icon name={look.icon} size={22} />
        </span>
        <div className="behavior-head-main">
          <span className="diagram-eyebrow">{kindLabel(behavior)}</span>
          <LabelField
            label="Name (use it as &name)"
            prefix="&"
            value={label}
            validate={(name) => validLabel(keymap, name, label)}
            onRename={onRename}
          />
        </div>
        <IconButton
          icon="trash"
          label={kind === 'macro' ? 'Delete this macro' : 'Delete this behavior'}
          tone="danger"
          onClick={() => {
            if (window.confirm(`Delete &${label}? Keys using it will do nothing.`)) onDelete();
          }}
        />
      </header>

      {kind === 'hold-tap' && <HoldTapDiagram behavior={behavior} label={label} onChange={onChange} />}
      {kind === 'mod-morph' && <ModMorphDiagram keymap={keymap} behavior={behavior} onChange={onChange} />}
      {kind === 'tap-dance' && <TapDanceDiagram keymap={keymap} behavior={behavior} onChange={onChange} />}
      {encoder && <EncoderDiagram keymap={keymap} behavior={behavior} onChange={onChange} />}
      {/* These editors bring their own fieldset cards. */}
      {kind === 'macro' && <MacroSteps keymap={keymap} behavior={behavior} onChange={onChange} />}
      {behavior.compatible === 'zmk,behavior-leader-key' && (
        <LeaderKeyEditor keymap={keymap} behavior={behavior} onChange={onChange} />
      )}
      {behavior.compatible === 'zmk,behavior-adaptive-key' && (
        <AdaptiveKeyEditor keymap={keymap} behavior={behavior} onChange={onChange} />
      )}
      {behavior.compatible === 'zmk,behavior-tri-state' && (
        <TriStateBindings keymap={keymap} behavior={behavior} onChange={onChange} />
      )}

      {rest.length > 0 &&
        (tucked ? (
          <details className="diagram-card advanced">
            <summary>{kind === 'mod-morph' ? 'More options' : 'Advanced timing'}</summary>
            <PropertyFields schemas={rest} properties={behavior.properties} onChange={onProperties} />
          </details>
        ) : (
          <section className="diagram-card" aria-label="Settings">
            <PropertyFields schemas={rest} properties={behavior.properties} onChange={onProperties} />
          </section>
        ))}
      {kind === 'other' && (
        <section className="diagram-card">
          <SourceEditor key={behaviorSource(behavior)} behavior={behavior} onChange={onChange} />
        </section>
      )}

      <footer className="behavior-tip">
        <Icon name={encoder ? 'rotateCw' : 'keyboard'} size={16} />
        <span className="grow">
          {encoder ? (
            <>Use it on a knob: palette → Encoder</>
          ) : (
            <>
              Use it on a key: palette → Your behaviors, <span className="mono">&amp;{label}</span>
            </>
          )}
        </span>
        <button
          type="button"
          className="button"
          onClick={() => onShowInPalette(encoder ? 'behaviors-sensor' : 'behaviors-custom')}
        >
          Show in palette
        </button>
      </footer>
    </div>
  );
}
