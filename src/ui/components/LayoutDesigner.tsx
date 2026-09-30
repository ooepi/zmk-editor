import { useMemo, useState, type Dispatch } from 'react';
import type { ZmkConfig } from '../../core/config.ts';
import { findKeyboard, KEYBOARDS, layoutsFor } from '../../core/catalog/keyboards.ts';
import { describeBinding, displayContext } from '../../core/keymap/display.ts';
import { layoutDtsi } from '../../core/layouts/dtsi.ts';
import { physicalLayoutFor, type PhysicalKey, type PhysicalLayout } from '../../core/layouts/index.ts';
import { gridTemplate, splitTemplate } from '../../core/layouts/templates.ts';
import { placeEncoders, setEncoderSpot } from '../../core/layouts/encoders.ts';
import type { EncoderSpot } from '../../core/layouts/types.ts';
import { encoderSides } from '../../core/encoderSides.ts';
import { sensorCount } from '../../core/keymap/sensorEdit.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { usePreferences } from '../state/preferences.ts';
import { DesignerCanvas, KnobFields, RotationField, UnitField } from './DesignerCanvas.tsx';
import { HelpLink } from '../help/HelpLink.tsx';
import { Section } from './ui/Section.tsx';

interface LayoutDesignerProps {
  config: ZmkConfig;
  dispatch: Dispatch<EditorAction>;
  onClose: () => void;
}

type Template = 'grid' | 'split' | 'catalog';

/**
 * Draw where the keys are: drag to move (snaps to ¼ key), arrows to nudge,
 * fields for exact size and rotation. Positions only; the key count and the
 * wiring stay as they are.
 */
export function LayoutDesigner({ config, dispatch, onClose }: LayoutDesignerProps) {
  const keyCount = config.keymap.layers[0]?.bindings.length ?? 0;
  const { layouts } = usePreferences();
  const initial = physicalLayoutFor(config.keyboard, keyCount, layouts[config.keyboard], config.layout);
  /** The layout being edited, starting from the current one (its knob positions too). */
  const start = (): PhysicalLayout => ({
    name: 'custom',
    keys: initial.keys.map((k) => ({ ...k })),
    ...(initial.encoders ? { encoders: initial.encoders.map((s) => (s ? { ...s } : null)) } : {}),
  });
  const [draft, setDraft] = useState<PhysicalLayout>(start);
  const [selection, setSelectionState] = useState<number[]>([0]);
  /** The selected encoder knob; selecting keys clears it, and the other way round. */
  const [knob, setKnob] = useState<number | null>(null);
  const setSelection = (indices: number[]) => {
    setSelectionState(indices);
    if (indices.length > 0) setKnob(null);
  };
  const selectKnob = (index: number | null) => {
    setKnob(index);
    if (index !== null) setSelectionState([]);
  };
  const encoderCount = sensorCount(config.keymap);
  const knobs = placeEncoders(draft, encoderSides(config), encoderCount);
  const selected = selection.length === 1 ? (selection[0] ?? null) : null;
  const [dirty, setDirty] = useState(false);
  const labels = useMemo(() => {
    const ctx = displayContext(config.keymap);
    return (config.keymap.layers[0]?.bindings ?? []).map((b) => describeBinding(b, ctx).main);
  }, [config.keymap]);

  const update = (next: PhysicalLayout) => {
    setDraft(next);
    setDirty(true);
  };
  /** Moves one knob (null: back to its default spot); the other knobs keep theirs. */
  const moveKnob = (index: number, spot: EncoderSpot | null) => {
    const { encoders: _, ...rest } = draft;
    const encoders = setEncoderSpot(draft.encoders, index, spot, encoderCount);
    update(encoders ? { ...rest, encoders } : rest);
  };
  const updateKey = (index: number, patch: Partial<PhysicalKey>) =>
    update({ ...draft, keys: draft.keys.map((k, i) => (i === index ? { ...k, ...patch } : k)) });

  const save = () => {
    dispatch({ type: 'editConfig', config: { ...config, layout: draft }, notice: 'Saved the layout; it is committed as config/info.json.' });
    setDirty(false);
  };

  const key = selected === null ? undefined : draft.keys[selected];

  return (
    <div className="designer">
      <div className="designer-main">
        <div className="designer-head">
          <div className="designer-head-title">
            <h2 className="panel-title">Layout designer · {findKeyboard(config.keyboard)?.name ?? config.keyboard}</h2>
            <div className="row">
              <button
                type="button"
                className="button"
                disabled={!dirty}
                onClick={() => {
                  setDraft(start());
                  setDirty(false);
                }}
              >
                Discard changes
              </button>
              <button type="button" className="button primary" disabled={!dirty} onClick={save}>
                Save layout
              </button>
            </div>
          </div>
          <p className="muted small">
            Drag keys (they snap to ¼ key) or select one and use the arrow keys (Shift: 1 key). Ctrl/Shift-click or drag a box
            to select several and move them together. Keys are numbered in keymap order. This changes where keys are drawn, not how they’re wired: the {keyCount} keys stay the same.{' '}
            <HelpLink to="designer" />
          </p>
        </div>
        <DesignerCanvas
          layout={draft}
          labels={labels}
          selection={selection}
          onSelectionChange={setSelection}
          onChange={update}
          knobs={knobs}
          selectedKnob={knob}
          onSelectKnob={selectKnob}
          onMoveKnob={moveKnob}
        />
      </div>

      <aside className="designer-panel" aria-label="Layout settings">
        <TemplatePanel keyCount={keyCount} onApply={(layout) => { update(layout); setSelection([0]); }} />

        {knob !== null && knobs[knob] ? (
          <KnobFields index={knob} spot={knobs[knob]} saved={!!draft.encoders?.[knob]} onMove={(spot) => moveKnob(knob, spot)} />
        ) : key && selected !== null ? (
          <Section
            title={`Key ${selected}`}
            lead={
              <kbd className="mini-key panel-key" aria-hidden="true">
                {labels[selected] || selected}
              </kbd>
            }
          >
            <div className="field-grid">
              <UnitField key={`x-${selected}`} label="X" value={key.x} onChange={(x) => updateKey(selected, { x })} />
              <UnitField key={`y-${selected}`} label="Y" value={key.y} onChange={(y) => updateKey(selected, { y })} />
              <UnitField key={`w-${selected}`} label="Width" value={key.w} min={25} onChange={(w) => updateKey(selected, { w })} />
              <UnitField key={`h-${selected}`} label="Height" value={key.h} min={25} onChange={(h) => updateKey(selected, { h })} />
              <RotationField
                key={`r-${selected}`}
                value={key.r}
                onChange={(r) => {
                  // Rotating an unrotated key turns it around its own centre.
                  const origin = key.r === 0 && key.rx === 0 && key.ry === 0 ? { rx: key.x + key.w / 2, ry: key.y + key.h / 2 } : {};
                  updateKey(selected, { r, ...origin });
                }}
              />
              <span />
              <UnitField key={`rx-${selected}`} label="Rotation origin X" value={key.rx} onChange={(rx) => updateKey(selected, { rx })} />
              <UnitField key={`ry-${selected}`} label="Rotation origin Y" value={key.ry} onChange={(ry) => updateKey(selected, { ry })} />
            </div>
            <div className="row wrap">
              <button type="button" className="button" onClick={() => updateKey(selected, { rx: key.x + key.w / 2, ry: key.y + key.h / 2 })}>
                Origin to centre
              </button>
              <button type="button" className="button" onClick={() => updateKey(selected, { r: 0, rx: 0, ry: 0 })}>
                No rotation
              </button>
            </div>
          </Section>
        ) : selection.length > 1 ? (
          <p className="muted small">{selection.length} keys selected. Drag them or use the arrow keys to move them together.</p>
        ) : (
          <p className="muted small">Select a key to edit it.</p>
        )}

        <div className="stack">
          {config.layout && (
            <button
              type="button"
              className="button danger"
              onClick={() => {
                const next = { ...config };
                delete next.layout;
                dispatch({ type: 'editConfig', config: next, notice: 'Removed your layout; the keyboard’s standard layout is used again.' });
                onClose();
              }}
            >
              Remove saved layout
            </button>
          )}
          <button type="button" className="button" onClick={onClose}>
            Close designer
          </button>
        </div>

        <details className="raw-conf">
          <summary>Export for ZMK (.dtsi)</summary>
          <p className="muted small">
            For keyboards you define yourself: this <span className="mono">zmk,physical-layout</span> node goes in your
            shield. Link it with <span className="mono">chosen {'{'} zmk,physical-layout = &amp;…; {'}'}</span>.
          </p>
          <pre className="source" aria-label="ZMK layout">{layoutDtsi(draft, config.keyboard)}</pre>
        </details>
      </aside>
    </div>
  );
}

function TemplatePanel({ keyCount, onApply }: { keyCount: number; onApply: (layout: PhysicalLayout) => void }) {
  const [template, setTemplate] = useState<Template>('split');
  const [columnsText, setColumns] = useState('6');
  const [thumbsText, setThumbs] = useState('3');
  const columns = Math.max(1, Math.round(Number(columnsText)) || 1);
  const thumbs = Math.max(0, Math.round(Number(thumbsText)) || 0);
  const matching = useMemo(
    () => KEYBOARDS.flatMap((k) => layoutsFor(k, keyCount).map((l) => ({ id: `${k.id}:${l.name}`, label: `${k.name} · ${l.name}`, layout: l }))),
    [keyCount],
  );
  const [catalogId, setCatalogId] = useState(matching[0]?.id ?? '');

  const build = (): PhysicalLayout | undefined => {
    if (template === 'grid') return gridTemplate(keyCount, columns);
    if (template === 'split') return splitTemplate(keyCount, { columns, thumbs });
    const found = matching.find((m) => m.id === catalogId)?.layout;
    return found && { name: 'custom', keys: found.keys.map((k) => ({ ...k })) };
  };

  return (
    <Section title="Start from a template" icon="layers">
      <label className="field">
        <span className="field-label">Template</span>
        <select className="input" value={template} onChange={(e) => setTemplate(e.target.value as Template)}>
          <option value="split">Split keyboard</option>
          <option value="grid">Grid (one piece)</option>
          <option value="catalog" disabled={matching.length === 0}>
            Another keyboard with {keyCount} keys
          </option>
        </select>
      </label>
      {template === 'catalog' ? (
        <label className="field">
          <span className="field-label">Keyboard</span>
          <select className="input" value={catalogId} onChange={(e) => setCatalogId(e.target.value)}>
            {matching.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="field-grid">
          <label className="field">
            <span className="field-label">{template === 'split' ? 'Columns per half' : 'Columns'}</span>
            <input className="input" type="number" min={1} max={20} value={columnsText} onChange={(e) => setColumns(e.target.value)} />
          </label>
          {template === 'split' && (
            <label className="field">
              <span className="field-label">Thumb keys per half</span>
              <input className="input" type="number" min={0} max={10} value={thumbsText} onChange={(e) => setThumbs(e.target.value)} />
            </label>
          )}
        </div>
      )}
      <button
        type="button"
        className="button"
        onClick={() => {
          const layout = build();
          if (layout && window.confirm('Replace the current positions with this template?')) onApply(layout);
        }}
      >
        Apply template
      </button>
    </Section>
  );
}
