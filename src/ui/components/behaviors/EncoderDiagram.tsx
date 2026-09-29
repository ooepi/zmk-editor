import type { Behavior, Binding, KeymapModel } from '../../../core/keymap/model.ts';
import { BindingEditor } from '../BindingEditor.tsx';
import { Icon } from '../Icon.tsx';

const NONE: Binding = { behavior: 'none', params: [] };

interface EncoderDiagramProps {
  keymap: KeymapModel;
  behavior: Behavior;
  onChange: (behavior: Behavior) => void;
}

/** A knob with what it sends each way: counter-clockwise on the left, clockwise on the right. */
export function EncoderDiagram({ keymap, behavior, onChange }: EncoderDiagramProps) {
  const setBinding = (index: number, binding: Binding) =>
    onChange({ ...behavior, bindings: behavior.bindings.with(index, binding) });
  // Bindings are [clockwise, counter-clockwise].
  const side = (index: number, name: string, icon: 'rotateCw' | 'rotateCcw') => (
    <div className="enc-side">
      <span className="diagram-eyebrow">
        <Icon name={icon} size={14} /> {name}
      </span>
      <BindingEditor
        binding={behavior.bindings[index] ?? NONE}
        keymap={keymap}
        context="key"
        label={name}
        onChange={(b) => setBinding(index, b)}
      />
    </div>
  );
  return (
    <section className="diagram-card" aria-label="What it does">
      <div className="enc-diagram">
        {side(1, 'Counter-clockwise', 'rotateCcw')}
        <span className="knob" aria-hidden="true" />
        {side(0, 'Clockwise', 'rotateCw')}
      </div>
    </section>
  );
}
