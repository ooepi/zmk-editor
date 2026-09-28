import { useMemo, type CSSProperties } from 'react';
import { describeBinding, displayContext } from '../../core/keymap/display.ts';
import type { KeymapModel } from '../../core/keymap/model.ts';
import { layoutBounds, type PhysicalLayout } from '../../core/layouts/index.ts';
import { Keycap, type KeyDropHandlers } from './Keycap.tsx';

interface KeyboardCanvasProps {
  keymap: KeymapModel;
  layout: PhysicalLayout;
  layer: number;
  selectedKey: number | null;
  onSelectKey: (index: number) => void;
  /** Keys to mark, e.g. the keys of the selected combo. */
  highlighted?: ReadonlySet<number>;
  /** Enables dragging keys and dropping palette tiles on them. */
  drop?: KeyDropHandlers | undefined;
}

/** Margin around the keys (in layout units) so rotated thumb keys aren't clipped. */
const MARGIN = 40;

export function KeyboardCanvas({ keymap, layout, layer, selectedKey, onSelectKey, highlighted, drop }: KeyboardCanvasProps) {
  const labels = useMemo(() => {
    const ctx = displayContext(keymap);
    return (keymap.layers[layer]?.bindings ?? []).map((binding) => describeBinding(binding, ctx));
  }, [keymap, layer]);

  const bounds = layoutBounds(layout);
  const width = bounds.width + 2 * MARGIN;
  const height = bounds.height + 2 * MARGIN;
  const style = { aspectRatio: `${width} / ${height}`, '--unit': `${(100 / width) * 100}cqw` } as CSSProperties;

  return (
    <div className="keyboard" style={style} role="group" aria-label="Keyboard layout">
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
            selected={selectedKey === index}
            highlighted={highlighted?.has(index) ?? false}
            style={keyStyle}
            onSelect={onSelectKey}
            drop={drop}
          />
        );
      })}
    </div>
  );
}
