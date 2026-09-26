import type { CSSProperties } from 'react';
import type { KeycapLabel } from '../../core/keymap/display.ts';

interface KeycapProps {
  index: number;
  label: KeycapLabel;
  selected: boolean;
  highlighted?: boolean;
  style: CSSProperties;
  onSelect: (index: number) => void;
}

function sizeClass(text: string): string {
  const length = [...text].length;
  if (length <= 2) return 'size-l';
  if (length <= 5) return 'size-m';
  if (length <= 9) return 'size-s';
  return 'size-xs';
}

export function Keycap({ index, label, selected, highlighted = false, style, onSelect }: KeycapProps) {
  const description = label.sub ? `${label.main} (${label.sub})` : label.main;
  return (
    <button
      type="button"
      className={`keycap kind-${label.kind}${selected ? ' selected' : ''}${highlighted ? ' highlighted' : ''}`}
      style={style}
      aria-label={`Key ${index}: ${description}`}
      aria-pressed={selected}
      title={description}
      onClick={() => onSelect(index)}
    >
      <span className={`keycap-main ${sizeClass(label.main)}`}>{label.main}</span>
      {label.sub && <span className="keycap-sub">{label.sub}</span>}
    </button>
  );
}
