import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { layoutBounds, type PhysicalKey, type PhysicalLayout } from '../../core/layouts/index.ts';
import { keysInBox, moveKeys, type Box } from '../../core/layouts/selection.ts';

const SNAP = 25;
const MARGIN = 150;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

/**
 * A number field that applies every valid value immediately (typing, the
 * spinner arrows) without reformatting what's being typed: "1." or "-" wait
 * until they're numbers. Out-of-range values are corrected on leaving.
 */
export function LiveNumberField({
  label,
  value,
  step,
  scale,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  /** Displayed value = value / scale (100 for key units, 1 for degrees). */
  scale: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  const format = (v: number) => String(Math.round((v / scale) * 100) / 100);
  const parse = (t: string) => (t.trim() === '' || t.trim() === '-' ? NaN : Math.round(Number(t) * scale));
  const [text, setText] = useState(format(value));
  const [shown, setShown] = useState(value);
  // Follow changes made elsewhere (dragging, arrow keys) unless the text already means the same.
  if (value !== shown) {
    setShown(value);
    if (parse(text) !== value) setText(format(value));
  }
  const inRange = (v: number) => (min === undefined || v >= min) && (max === undefined || v <= max);
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="input"
        type="number"
        step={step}
        min={min === undefined ? undefined : min / scale}
        max={max === undefined ? undefined : max / scale}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = parse(e.target.value);
          if (Number.isFinite(v) && inRange(v)) onChange(v);
        }}
        onBlur={() => {
          const v = parse(text);
          if (!Number.isFinite(v)) setText(format(value));
          else if (!inRange(v)) onChange(Math.min(max ?? v, Math.max(min ?? v, v)));
        }}
      />
    </label>
  );
}

export function UnitField({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (v: number) => void }) {
  return <LiveNumberField label={`${label} (keys)`} value={value} step={0.25} scale={100} min={min} onChange={onChange} />;
}

/** Degrees, clockwise. */
export function RotationField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <LiveNumberField label="Rotation (°)" value={value} step={1} scale={1} min={-360} max={360} onChange={onChange} />;
}

/**
 * Keys to move around. Click selects a key; Ctrl/Shift/⌘-click adds or removes
 * keys; dragging on an empty spot selects every key the box touches. Dragging
 * a selected key or pressing the arrow keys moves the whole selection.
 */
export function DesignerCanvas({
  layout,
  labels,
  selection,
  onSelectionChange,
  onChange,
  onDelete,
  flagged,
}: {
  layout: PhysicalLayout;
  labels: string[];
  /** Selected key indices. */
  selection: number[];
  onSelectionChange: (indices: number[]) => void;
  onChange: (layout: PhysicalLayout) => void;
  /** Delete/Backspace removes the selected keys, when the caller allows it. */
  onDelete?: (indices: number[]) => void;
  flagged?: Set<number>;
}) {
  const svg = useRef<SVGSVGElement>(null);
  // Keys being dragged, with the layout as it was when the drag started.
  const drag = useRef<{ indices: number[]; startX: number; startY: number; keys: PhysicalKey[] } | null>(null);
  // A pointer press on a key is handled there; the focus it causes must not change the selection again.
  const pressing = useRef(false);
  const [marquee, setMarquee] = useState<{ box: Box; additive: boolean } | null>(null);
  // The view box is fixed while dragging so the canvas doesn't rescale under the pointer.
  const [frozenBox, setFrozenBox] = useState<string | null>(null);
  const bounds = layoutBounds(layout);
  const minX = Math.min(0, ...layout.keys.map((k) => k.x)) - MARGIN;
  const minY = Math.min(0, ...layout.keys.map((k) => k.y)) - MARGIN;
  const box = frozenBox ?? `${minX} ${minY} ${bounds.width - minX + MARGIN} ${bounds.height - minY + MARGIN}`;
  const selected = new Set(selection);

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

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const moving = selected.has(index) ? selection : [index];
    if (event.key === 'Escape') {
      event.preventDefault();
      onSelectionChange([]);
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && onDelete) {
      event.preventDefault();
      onDelete(moving);
      return;
    }
    const step = event.shiftKey ? 100 : SNAP;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    onChange({ ...layout, keys: moveKeys(layout.keys, moving, move[0], move[1]) });
  };

  const endPointer = () => {
    if (marquee) {
      const hits = keysInBox(layout.keys, marquee.box);
      onSelectionChange(marquee.additive ? [...new Set([...selection, ...hits])] : hits);
    }
    drag.current = null;
    pressing.current = false;
    setMarquee(null);
    setFrozenBox(null);
  };

  return (
    <svg
      ref={svg}
      className="designer-canvas"
      viewBox={box}
      role="group"
      aria-label="Layout canvas"
      onPointerDown={(event) => {
        // Only presses on the empty canvas start a selection box; keys handle their own.
        if (event.target !== event.currentTarget) return;
        const p = toSvg(event);
        if (!p) {
          if (!event.ctrlKey && !event.metaKey && !event.shiftKey) onSelectionChange([]);
          return;
        }
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setMarquee({ box: { x1: p.x, y1: p.y, x2: p.x, y2: p.y }, additive: event.ctrlKey || event.metaKey || event.shiftKey });
        setFrozenBox(box);
      }}
      onPointerMove={(event) => {
        const p = (drag.current || marquee) && toSvg(event);
        if (!p) return;
        if (marquee) {
          setMarquee({ ...marquee, box: { ...marquee.box, x2: p.x, y2: p.y } });
          return;
        }
        const d = drag.current;
        if (!d) return;
        const dx = snap(p.x - d.startX);
        const dy = snap(p.y - d.startY);
        onChange({ ...layout, keys: moveKeys(d.keys, d.indices, dx, dy) });
      }}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      {layout.keys.map((key, index) => (
        <g
          key={index}
          role="button"
          tabIndex={0}
          aria-label={`Key ${index}: ${labels[index] ?? ''}`}
          aria-pressed={selected.has(index)}
          className={`designer-key${selected.has(index) ? ' selected' : ''}${flagged?.has(index) ? ' flagged' : ''}`}
          transform={key.r ? `rotate(${key.r} ${key.rx} ${key.ry})` : undefined}
          onFocus={() => {
            // Tabbing to a key selects it; a click already chose the selection.
            if (!pressing.current && !selected.has(index)) onSelectionChange([index]);
          }}
          onKeyDown={(e) => onKeyDown(e, index)}
          onPointerDown={(event) => {
            pressing.current = true;
            if (event.ctrlKey || event.metaKey || event.shiftKey) {
              onSelectionChange(selected.has(index) ? selection.filter((i) => i !== index) : [...selection, index]);
              return;
            }
            const moving = selected.has(index) ? selection : [index];
            if (!selected.has(index)) onSelectionChange(moving);
            const p = toSvg(event);
            if (!p) return;
            (event.target as Element).setPointerCapture?.(event.pointerId);
            drag.current = { indices: moving, startX: p.x, startY: p.y, keys: layout.keys };
            setFrozenBox(box);
          }}
          onPointerUp={() => {
            if (!drag.current) pressing.current = false;
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
      {marquee && (
        <rect
          className="designer-marquee"
          x={Math.min(marquee.box.x1, marquee.box.x2)}
          y={Math.min(marquee.box.y1, marquee.box.y2)}
          width={Math.abs(marquee.box.x2 - marquee.box.x1)}
          height={Math.abs(marquee.box.y2 - marquee.box.y1)}
        />
      )}
    </svg>
  );
}
