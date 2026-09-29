import { useMemo } from 'react';
import { MOD_MORPH_PROPERTIES } from '../../../core/catalog/properties.ts';
import { describeBinding, displayContext } from '../../../core/keymap/display.ts';
import type { Behavior, Binding, KeymapModel } from '../../../core/keymap/model.ts';
import { BindingEditor } from '../BindingEditor.tsx';
import { PropertyFields } from '../PropertyFields.tsx';
import { MOD_MORPH_DIAGRAM_PROPERTIES } from './kinds.ts';

const MODS = MOD_MORPH_PROPERTIES.filter((s) => MOD_MORPH_DIAGRAM_PROPERTIES.includes(s.name));
const NONE: Binding = { behavior: 'none', params: [] };

interface ModMorphDiagramProps {
  keymap: KeymapModel;
  behavior: Behavior;
  onChange: (behavior: Behavior) => void;
}

/** "Normally [X]" beside "With [mods] → [Y]". */
export function ModMorphDiagram({ keymap, behavior, onChange }: ModMorphDiagramProps) {
  const [normal, morphed] = [behavior.bindings[0] ?? NONE, behavior.bindings[1] ?? NONE];
  const labels = useMemo(() => {
    const ctx = displayContext(keymap);
    return [describeBinding(normal, ctx).main, describeBinding(morphed, ctx).main];
  }, [keymap, normal, morphed]);
  const setBinding = (index: number, binding: Binding) =>
    onChange({ ...behavior, bindings: behavior.bindings.with(index, binding) });

  return (
    <section className="diagram-card" aria-label="What it does">
      <div className="mm-diagram">
        <div className="mm-case">
          <span className="diagram-eyebrow">Normally</span>
          <kbd className="big-key" aria-hidden="true">
            {labels[0]}
          </kbd>
          <BindingEditor binding={normal} keymap={keymap} context="key" label="Normally" onChange={(b) => setBinding(0, b)} />
        </div>
        <span className="mm-arrow" aria-hidden="true">
          →
        </span>
        <div className="mm-case">
          <span className="diagram-eyebrow">With a modifier</span>
          <kbd className="big-key morphed" aria-hidden="true">
            {labels[1]}
          </kbd>
          <PropertyFields
            schemas={MODS}
            properties={behavior.properties}
            onChange={(properties) => onChange({ ...behavior, properties })}
          />
          <BindingEditor
            binding={morphed}
            keymap={keymap}
            context="key"
            label="With modifier"
            onChange={(b) => setBinding(1, b)}
          />
        </div>
      </div>
    </section>
  );
}
