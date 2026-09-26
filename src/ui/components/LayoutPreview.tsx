import type { CSSProperties } from 'react';
import { layoutBounds, type PhysicalLayout } from '../../core/layouts/index.ts';

const MARGIN = 30;

/** Key outlines only, for choosing a keyboard. */
export function LayoutPreview({ layout, label }: { layout: PhysicalLayout; label: string }) {
  const bounds = layoutBounds(layout);
  const width = bounds.width + 2 * MARGIN;
  const height = bounds.height + 2 * MARGIN;
  return (
    <div className="layout-preview" style={{ aspectRatio: `${width} / ${height}` }} role="img" aria-label={label}>
      {layout.keys.map((key, i) => {
        const style: CSSProperties = {
          left: `${((key.x + MARGIN) / width) * 100}%`,
          top: `${((key.y + MARGIN) / height) * 100}%`,
          width: `${(key.w / width) * 100}%`,
          height: `${(key.h / height) * 100}%`,
        };
        if (key.r) {
          style.transform = `rotate(${key.r}deg)`;
          style.transformOrigin = `${((key.rx - key.x) / key.w) * 100}% ${((key.ry - key.y) / key.h) * 100}%`;
        }
        return <span key={i} className="preview-key" style={style} />;
      })}
    </div>
  );
}
