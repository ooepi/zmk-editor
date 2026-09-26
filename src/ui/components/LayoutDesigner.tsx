import { useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type PointerEvent } from 'react';
import type { ZmkConfig } from '../../core/config.ts';
import { findKeyboard, KEYBOARDS, layoutsFor } from '../../core/catalog/keyboards.ts';
import { describeBinding, displayContext } from '../../core/keymap/display.ts';
import { layoutDtsi } from '../../core/layouts/dtsi.ts';
import { layoutBounds, physicalLayoutFor, type PhysicalKey, type PhysicalLayout } from '../../core/layouts/index.ts';
import { gridTemplate, splitTemplate } from '../../core/layouts/templates.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { usePreferences } from '../state/preferences.ts';

interface LayoutDesignerProps {
  config: ZmkConfig;
  dispatch: Dispatch<EditorAction>;
  onClose: () => void;
}

const SNAP = 25;
const MARGIN = 150;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const units = (v: number) => Math.round(v) / 100;

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
  const [draft, setDraft] = useState<PhysicalLayout>(() => ({ name: 'custom', keys: initial.keys.map((k) => ({ ...k })) }));
  const [selected, setSelected] = useState<number | null>(0);
  const [dirty, setDirty] = useState(false);
  const labels = useMemo(() => {
    const ctx = displayContext(config.keymap);
    return (config.keymap.layers[0]?.bindings ?? []).map((b) => describeBinding(b, ctx).main);
  }, [config.keymap]);

  const update = (next: PhysicalLayout) => {
    setDraft(next);
    setDirty(true);
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
          <h2 className="panel-title">Layout designer · {findKeyboard(config.keyboard)?.name ?? config.keyboard}</h2>
          <p className="muted small">
            Drag keys (they snap to ¼ key) or select one and use the arrow keys (Shift: 1 key). Keys are numbered in keymap
            order. This changes where keys are drawn, not how they’re wired: the {keyCount} keys stay the same.
          </p>
        </div>
        <DesignerCanvas layout={draft} labels={labels} selected={selected} onSelect={setSelected} onChange={update} />
      </div>

      <aside className="designer-panel" aria-label="Layout settings">
        <TemplatePanel keyCount={keyCount} onApply={(layout) => { update(layout); setSelected(0); }} />

        {key && selected !== null ? (
          <fieldset className="fieldset">
            <legend>Key {selected} · {labels[selected] ?? ''}</legend>
            <div className="field-grid">
              <UnitField key={`x-${selected}-${key.x}`} label="X" value={key.x} onChange={(x) => updateKey(selected, { x })} />
              <UnitField key={`y-${selected}-${key.y}`} label="Y" value={key.y} onChange={(y) => updateKey(selected, { y })} />
              <UnitField key={`w-${selected}-${key.w}`} label="Width" value={key.w} min={25} onChange={(w) => updateKey(selected, { w })} />
              <UnitField key={`h-${selected}-${key.h}`} label="Height" value={key.h} min={25} onChange={(h) => updateKey(selected, { h })} />
              <RotationField
                key={`r-${selected}-${key.r}`}
                value={key.r}
                onChange={(r) => {
                  // Rotating an unrotated key turns it around its own centre.
                  const origin = key.r === 0 && key.rx === 0 && key.ry === 0 ? { rx: key.x + key.w / 2, ry: key.y + key.h / 2 } : {};
                  updateKey(selected, { r, ...origin });
                }}
              />
              <span />
              <UnitField key={`rx-${selected}-${key.rx}`} label="Rotation origin X" value={key.rx} onChange={(rx) => updateKey(selected, { rx })} />
              <UnitField key={`ry-${selected}-${key.ry}`} label="Rotation origin Y" value={key.ry} onChange={(ry) => updateKey(selected, { ry })} />
            </div>
            <div className="row wrap">
              <button type="button" className="button" onClick={() => updateKey(selected, { rx: key.x + key.w / 2, ry: key.y + key.h / 2 })}>
                Origin to centre
              </button>
              <button type="button" className="button" onClick={() => updateKey(selected, { r: 0, rx: 0, ry: 0 })}>
                No rotation
              </button>
            </div>
          </fieldset>
        ) : (
          <p className="muted small">Select a key to edit it.</p>
        )}

        <div className="stack">
          <button type="button" className="button primary" disabled={!dirty} onClick={save}>
            Save layout
          </button>
          <button
            type="button"
            className="button"
            disabled={!dirty}
            onClick={() => {
              setDraft({ name: 'custom', keys: initial.keys.map((k) => ({ ...k })) });
              setDirty(false);
            }}
          >
            Discard changes
          </button>
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

/** A key-unit number field; applies on Enter or when leaving the field, so typing isn't reformatted. */
function UnitField({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(units(value)));
  const apply = () => {
    const v = Math.round(Number(text) * 100);
    if (text.trim() === '' || !Number.isFinite(v)) setText(String(units(value)));
    else onChange(min === undefined ? v : Math.max(min, v));
  };
  return (
    <label className="field">
      <span className="field-label">{label} (keys)</span>
      <input
        className="input"
        type="number"
        step={0.25}
        min={min === undefined ? undefined : min / 100}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply();
        }}
      />
    </label>
  );
}

/** Degrees, clockwise; applies on Enter or when leaving the field (so "-15" can be typed). */
function RotationField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const apply = () => {
    const v = Number(text);
    if (text.trim() === '' || !Number.isFinite(v)) setText(String(value));
    else onChange(Math.max(-360, Math.min(360, v)));
  };
  return (
    <label className="field">
      <span className="field-label">Rotation (°)</span>
      <input
        className="input"
        type="number"
        step={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply();
        }}
      />
    </label>
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
    <fieldset className="fieldset">
      <legend>Start from a template</legend>
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
    </fieldset>
  );
}

function DesignerCanvas({
  layout,
  labels,
  selected,
  onSelect,
  onChange,
}: {
  layout: PhysicalLayout;
  labels: string[];
  selected: number | null;
  onSelect: (index: number) => void;
  onChange: (layout: PhysicalLayout) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ index: number; startX: number; startY: number; key: PhysicalKey } | null>(null);
  // The view box is fixed while dragging so the canvas doesn't rescale under the pointer.
  const [frozenBox, setFrozenBox] = useState<string | null>(null);
  const bounds = layoutBounds(layout);
  const minX = Math.min(0, ...layout.keys.map((k) => k.x)) - MARGIN;
  const minY = Math.min(0, ...layout.keys.map((k) => k.y)) - MARGIN;
  const box = frozenBox ?? `${minX} ${minY} ${bounds.width - minX + MARGIN} ${bounds.height - minY + MARGIN}`;

  const toSvg = (event: PointerEvent) => {
    // getScreenCTM is missing outside real browsers (e.g. jsdom in tests).
    if (!svg.current || typeof svg.current.getScreenCTM !== 'function') return null;
    const matrix = svg.current.getScreenCTM()?.inverse();
    if (!matrix) return null;
    const point = svg.current.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(matrix);
  };

  const moveKey = (index: number, dx: number, dy: number) => {
    const key = layout.keys[index];
    if (!key) return;
    const moved = { ...key, x: key.x + dx, y: key.y + dy };
    // A rotated key's origin moves with it.
    if (key.r) Object.assign(moved, { rx: key.rx + dx, ry: key.ry + dy });
    onChange({ ...layout, keys: layout.keys.map((k, i) => (i === index ? moved : k)) });
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step = event.shiftKey ? 100 : SNAP;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    moveKey(index, move[0], move[1]);
  };

  return (
    <svg
      ref={svg}
      className="designer-canvas"
      viewBox={box}
      role="group"
      aria-label="Layout canvas"
      onPointerMove={(event) => {
        const d = drag.current;
        const p = d && toSvg(event);
        if (!d || !p) return;
        const dx = snap(p.x - d.startX) - (layout.keys[d.index]?.x ?? 0) + d.key.x;
        const dy = snap(p.y - d.startY) - (layout.keys[d.index]?.y ?? 0) + d.key.y;
        if (dx || dy) moveKey(d.index, dx, dy);
      }}
      onPointerUp={() => {
        drag.current = null;
        setFrozenBox(null);
      }}
    >
      {layout.keys.map((key, index) => (
        <g
          key={index}
          role="button"
          tabIndex={0}
          aria-label={`Key ${index}: ${labels[index] ?? ''}`}
          aria-pressed={selected === index}
          className={`designer-key${selected === index ? ' selected' : ''}`}
          transform={key.r ? `rotate(${key.r} ${key.rx} ${key.ry})` : undefined}
          onFocus={() => onSelect(index)}
          onKeyDown={(e) => onKeyDown(e, index)}
          onPointerDown={(event) => {
            onSelect(index);
            const p = toSvg(event);
            if (!p) return;
            (event.target as Element).setPointerCapture?.(event.pointerId);
            drag.current = { index, startX: p.x, startY: p.y, key: { ...key } };
            setFrozenBox(box);
          }}
        >
          <rect x={key.x + 4} y={key.y + 4} width={key.w - 8} height={key.h - 8} rx={10} />
          <text x={key.x + key.w / 2} y={key.y + key.h / 2 - 6} textAnchor="middle" className="designer-label">
            {labels[index]?.slice(0, 6)}
          </text>
          <text x={key.x + key.w / 2} y={key.y + key.h / 2 + 26} textAnchor="middle" className="designer-index">
            {index}
          </text>
        </g>
      ))}
    </svg>
  );
}
