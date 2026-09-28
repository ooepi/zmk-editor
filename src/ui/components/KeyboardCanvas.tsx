import { useMemo, useState, type CSSProperties, type PointerEvent } from 'react';
import { describeBinding, displayContext } from '../../core/keymap/display.ts';
import type { KeymapModel } from '../../core/keymap/model.ts';
import { layoutBounds, type PhysicalLayout } from '../../core/layouts/index.ts';
import { keysInBox, type Box } from '../../core/layouts/selection.ts';
import { Keycap, type KeyDropHandlers } from './Keycap.tsx';

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
}: KeyboardCanvasProps) {
  const [marquee, setMarquee] = useState<{ box: Box; additive: boolean } | null>(null);
  const labels = useMemo(() => {
    const ctx = displayContext(keymap);
    return (keymap.layers[layer]?.bindings ?? []).map((binding) => describeBinding(binding, ctx));
  }, [keymap, layer]);
  const selected = new Set(selection);

  const bounds = layoutBounds(layout);
  const width = bounds.width + 2 * MARGIN;
  const height = bounds.height + 2 * MARGIN;
  const style = { aspectRatio: `${width} / ${height}`, '--unit': `${(100 / width) * 100}cqw` } as CSSProperties;

  /** The pointer position in layout units. */
  const toLayout = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * width - MARGIN,
      y: ((event.clientY - rect.top) / rect.height) * height - MARGIN,
    };
  };

  const boxHandlers = onSelectBox
    ? {
        onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
          // Keys handle their own presses; only the empty area starts a box.
          if (event.target !== event.currentTarget || event.button !== 0) return;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          const p = toLayout(event);
          setMarquee({ box: { x1: p.x, y1: p.y, x2: p.x, y2: p.y }, additive: event.ctrlKey || event.metaKey || event.shiftKey });
        },
        onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
          if (!marquee) return;
          const p = toLayout(event);
          setMarquee({ ...marquee, box: { ...marquee.box, x2: p.x, y2: p.y } });
        },
        onPointerUp: () => {
          if (!marquee) return;
          const { box, additive } = marquee;
          const dragged = Math.abs(box.x2 - box.x1) > DRAG_THRESHOLD || Math.abs(box.y2 - box.y1) > DRAG_THRESHOLD;
          onSelectBox(dragged ? keysInBox(layout.keys, box) : [], additive);
          setMarquee(null);
        },
        onPointerCancel: () => setMarquee(null),
      }
    : {};

  return (
    <div className="keyboard" style={style} role="group" aria-label="Keyboard layout" {...boxHandlers}>
      {layout.keys.map((key, index) => {
        const label = labels[index];
        if (!label) return null;
        const keyStyle: CSSProperties = {
          left: `${((key.x + MARGIN) / width) * 100}%`,
          top: `${((key.y + MARGIN) / height) * 100}%`,
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
            style={keyStyle}
            onSelect={onSelectKey}
            drop={drop}
          />
        );
      })}
      {marquee && (
        <div
          className="select-box"
          aria-hidden="true"
          style={{
            left: `${((Math.min(marquee.box.x1, marquee.box.x2) + MARGIN) / width) * 100}%`,
            top: `${((Math.min(marquee.box.y1, marquee.box.y2) + MARGIN) / height) * 100}%`,
            width: `${(Math.abs(marquee.box.x2 - marquee.box.x1) / width) * 100}%`,
            height: `${(Math.abs(marquee.box.y2 - marquee.box.y1) / height) * 100}%`,
          }}
        />
      )}
    </div>
  );
}
