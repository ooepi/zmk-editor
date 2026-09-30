import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { describeBinding, displayContext } from '../../core/keymap/display.ts';
import type { KeymapModel } from '../../core/keymap/model.ts';
import { layoutExtent, type PhysicalLayout } from '../../core/layouts/index.ts';
import { keysInBox, type Box } from '../../core/layouts/selection.ts';
import { Keycap, NEEDS_BUILD_NOTE, type KeyDropHandlers } from './Keycap.tsx';
import { EncoderKnobs, type EncoderControls } from './EncoderKnobs.tsx';
import { knobBox } from '../../core/layouts/encoders.ts';
import type { EncoderSpot } from '../../core/layouts/types.ts';

interface KeyboardCanvasProps {
  keymap: KeymapModel;
  layout: PhysicalLayout;
  layer: number;
  selection: readonly number[];
  /** `additive` for Ctrl/Shift-clicks. */
  onSelectKey: (index: number, additive: boolean) => void;
  /** Enables box select on the empty area; a click there without dragging selects nothing. */
  onSelectBox?: ((indices: number[], additive: boolean) => void) | undefined;
  /** Keys to mark, e.g. the keys of the selected combo. */
  highlighted?: ReadonlySet<number>;
  /** Enables dragging keys and dropping palette tiles on them. */
  drop?: KeyDropHandlers | undefined;
  /** Keys whose change waits for the next build (a ZMK Studio keyboard can't take it). */
  flagged?: ReadonlySet<number> | undefined;
  /** Where the encoder knobs go; the keyboard makes room for them even when they aren't shown. */
  knobs?: EncoderSpot[] | undefined;
  /** Shows the knobs and makes them editable. */
  encoders?: EncoderControls | undefined;
}

/** Margin around the keys (in layout units) so rotated thumb keys aren't clipped. */
const MARGIN = 40;
/** How far (in layout units) the pointer must move before a press counts as a box drag. */
const DRAG_THRESHOLD = 10;

export function KeyboardCanvas({
  keymap,
  layout,
  layer,
  selection,
  onSelectKey,
  onSelectBox,
  highlighted,
  drop,
  flagged,
  knobs = [],
  encoders,
}: KeyboardCanvasProps) {
  const [marquee, setMarquee] = useState<{ box: Box; additive: boolean } | null>(null);
  const labels = useMemo(() => {
    const ctx = displayContext(keymap);
    return (keymap.layers[layer]?.bindings ?? []).map((binding) => describeBinding(binding, ctx));
  }, [keymap, layer]);
  const selected = new Set(selection);

  // Keys can sit left of or above 0 (rotated thumb keys, moved keys): draw from the real extent.
  const extent = layoutExtent({ ...layout, encoders: knobs });
  const width = extent.width + 2 * MARGIN;
  const height = extent.height + 2 * MARGIN;
  /** Where layout x/y = 0 is on the canvas, in layout units. */
  const originX = MARGIN - extent.left;
  const originY = MARGIN - extent.top;
  const style = {
    aspectRatio: `${width} / ${height}`,
    '--ratio': width / height,
    '--unit': `${(100 / width) * 100}cqw`,
  } as CSSProperties;

  const board = useRef<HTMLDivElement>(null);
  const latest = useRef({ width, height, originX, originY, layout, onSelectBox });
  useEffect(() => {
    latest.current = { width, height, originX, originY, layout, onSelectBox };
  });
  const boxSelect = onSelectBox !== undefined;

  // Box select starts anywhere on the empty canvas around the keyboard, not only inside it: the
  // listeners go on the canvas, and positions are measured against the keyboard (camera included).
  useEffect(() => {
    const keyboard = board.current;
    if (!boxSelect || !keyboard) return;
    const area = keyboard.closest<HTMLElement>('.canvas') ?? keyboard;
    let current: { box: Box; additive: boolean } | null = null;
    const toLayout = (event: globalThis.PointerEvent) => {
      const { width: w, height: h, originX: ox, originY: oy } = latest.current;
      const rect = keyboard.getBoundingClientRect();
      return { x: ((event.clientX - rect.left) / rect.width) * w - ox, y: ((event.clientY - rect.top) / rect.height) * h - oy };
    };
    /** Empty space: the canvas, the camera stage or the keyboard itself; not a key, an encoder or a control. */
    const empty = (target: EventTarget | null) =>
      target === area || target === keyboard || (target instanceof HTMLElement && target.classList.contains('camera-stage'));
    const down = (event: globalThis.PointerEvent) => {
      if (event.button !== 0 || !empty(event.target)) return;
      area.setPointerCapture?.(event.pointerId);
      const p = toLayout(event);
      current = { box: { x1: p.x, y1: p.y, x2: p.x, y2: p.y }, additive: event.ctrlKey || event.metaKey || event.shiftKey };
      setMarquee(current);
    };
    const move = (event: globalThis.PointerEvent) => {
      if (!current) return;
      const p = toLayout(event);
      current = { ...current, box: { ...current.box, x2: p.x, y2: p.y } };
      setMarquee(current);
    };
    const up = () => {
      if (!current) return;
      const { box, additive } = current;
      current = null;
      setMarquee(null);
      const dragged = Math.abs(box.x2 - box.x1) > DRAG_THRESHOLD || Math.abs(box.y2 - box.y1) > DRAG_THRESHOLD;
      latest.current.onSelectBox?.(dragged ? keysInBox(latest.current.layout.keys, box) : [], additive);
    };
    const cancel = () => {
      current = null;
      setMarquee(null);
    };
    area.addEventListener('pointerdown', down);
    area.addEventListener('pointermove', move);
    area.addEventListener('pointerup', up);
    area.addEventListener('pointercancel', cancel);
    return () => {
      area.removeEventListener('pointerdown', down);
      area.removeEventListener('pointermove', move);
      area.removeEventListener('pointerup', up);
      area.removeEventListener('pointercancel', cancel);
    };
  }, [boxSelect]);

  return (
    <div ref={board} className="keyboard" style={style} role="group" aria-label="Keyboard layout">
      {flagged && flagged.size > 0 && (
        <span id={NEEDS_BUILD_NOTE} hidden>
          Needs a build: the keyboard can’t take this change live.
        </span>
      )}
      {layout.keys.map((key, index) => {
        const label = labels[index];
        if (!label) return null;
        const keyStyle: CSSProperties = {
          left: `${((key.x + originX) / width) * 100}%`,
          top: `${((key.y + originY) / height) * 100}%`,
          width: `${(key.w / width) * 100}%`,
          height: `${(key.h / height) * 100}%`,
        };
        if (key.r) {
          keyStyle.transform = `rotate(${key.r}deg)`;
          keyStyle.transformOrigin = `${((key.rx - key.x) / key.w) * 100}% ${((key.ry - key.y) / key.h) * 100}%`;
        }
        return (
          <Keycap
            key={index}
            index={index}
            label={label}
            selected={selected.has(index)}
            highlighted={highlighted?.has(index) ?? false}
            flagged={flagged?.has(index) ?? false}
            style={keyStyle}
            onSelect={onSelectKey}
            drop={drop}
          />
        );
      })}
      {encoders && <EncoderKnobs keymap={keymap} layer={layer} spots={knobs} place={(spot) => knobBox(spot, width, height, originX, originY)} {...encoders} />}
      {marquee && (
        <div
          className="select-box"
          aria-hidden="true"
          style={{
            left: `${((Math.min(marquee.box.x1, marquee.box.x2) + originX) / width) * 100}%`,
            top: `${((Math.min(marquee.box.y1, marquee.box.y2) + originY) / height) * 100}%`,
            width: `${(Math.abs(marquee.box.x2 - marquee.box.x1) / width) * 100}%`,
            height: `${(Math.abs(marquee.box.y2 - marquee.box.y1) / height) * 100}%`,
          }}
        />
      )}
    </div>
  );
}
