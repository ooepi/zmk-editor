import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { layoutBounds, type PhysicalKey, type PhysicalLayout } from '../../core/layouts/index.ts';

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

export function DesignerCanvas({
  layout,
  labels,
  selected,
  onSelect,
  onChange,
  flagged,
}: {
  layout: PhysicalLayout;
  labels: string[];
  selected: number | null;
  onSelect: (index: number) => void;
  onChange: (layout: PhysicalLayout) => void;
  flagged?: Set<number>;
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
          className={`designer-key${selected === index ? ' selected' : ''}${flagged?.has(index) ? ' flagged' : ''}`}
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
