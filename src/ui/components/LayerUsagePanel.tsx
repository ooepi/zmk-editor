import { Fragment, useMemo, type Dispatch, type ReactNode } from 'react';
import {
  layerUsage,
  type LayerRefKind,
  type LayerReference,
  type LayerSource,
  type LayerWarning,
} from '../../core/keymap/layerUsage.ts';
import type { KeymapModel } from '../../core/keymap/model.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { Section } from './ui/Section.tsx';

const KIND_TEXT: Record<LayerRefKind, string> = {
  momentary: 'while held',
  toggle: 'toggle',
  to: 'switch to',
  sticky: 'for one key',
  conditional: 'together',
};

/** How many transparent base keys the warning names before "and N more". */
const BASE_TRANS_SHOWN = 6;

/** A stable React key for where a reference is. */
function sourceKey(from: LayerSource): string {
  switch (from.kind) {
    case 'key':
      return `k${from.layer}.${from.key}`;
    case 'encoder':
      return `e${from.layer}.${from.sensor}`;
    case 'combo':
    case 'conditional':
      return `${from.kind}:${from.name}`;
  }
}

function warningKey(w: LayerWarning): string {
  switch (w.kind) {
    case 'missing-layer':
      return `missing:${sourceKey(w.from)}:${w.token}`;
    case 'unreachable':
    case 'no-way-back':
      return `${w.kind}:${w.layer}`;
    case 'unresolved':
    case 'base-trans':
      return w.kind;
  }
}

/** Refs that turn the layer on from elsewhere: a layer's own off switch isn't a way in. */
function waysIn(refs: LayerReference[], layer: number): LayerReference[] {
  return refs.filter((r) => r.to === layer && r.mode !== 'off' && !('layer' in r.from && r.from.layer === layer));
}

interface Props {
  keymap: KeymapModel;
  dispatch: Dispatch<EditorAction>;
  onOpenCombo: (name: string) => void;
}

/** What turns each layer on, and layer mistakes to fix before a build. */
export function LayerUsagePanel({ keymap, dispatch, onOpenCombo }: Props) {
  const { references: refs, warnings } = useMemo(() => layerUsage(keymap), [keymap]);
  const layerName = (index: number) => {
    const layer = keymap.layers[index];
    return layer ? (layer.displayName ?? layer.name) : `Layer ${index}`;
  };

  const go = (from: LayerSource) => {
    if (from.kind === 'combo') return onOpenCombo(from.name);
    if (from.kind === 'conditional') return;
    dispatch({ type: 'selectLayer', index: from.layer });
    if (from.kind === 'key') dispatch({ type: 'selectKey', index: from.key });
    else dispatch({ type: 'selectSensor', index: from.sensor });
  };

  /** "NAV key 30", "Combo esc_tab", "Lower + Raise". */
  const where = (from: LayerSource) => {
    switch (from.kind) {
      case 'key':
        return `${layerName(from.layer)} key ${from.key}`;
      case 'encoder':
        return `${layerName(from.layer)} encoder ${from.sensor + 1}`;
      case 'combo':
        return `Combo ${from.name}`;
      case 'conditional':
        return from.ifLayers.map(layerName).join(' + ');
    }
  };

  /** A button that goes to the key, encoder or combo; conditional layers have nowhere to go. */
  const source = (from: LayerSource, label: string, children: ReactNode) =>
    from.kind === 'conditional' ? (
      <span className="chip layer-ref static">{children}</span>
    ) : (
      <button type="button" className="chip layer-ref" aria-label={label} onClick={() => go(from)}>
        {children}
      </button>
    );

  const refChip = (r: LayerReference) => {
    const shown = r.via ?? r.behavior;
    const label = `${where(r.from)}: ${KIND_TEXT[r.kind]}${r.kind === 'conditional' ? '' : ` (&${shown})`}`;
    return source(
      r.from,
      label,
      <>
        {where(r.from)}
        {r.kind !== 'conditional' && <span className="layer-ref-behavior">&amp;{shown}</span>}
      </>,
    );
  };

  const warningText = (w: LayerWarning) => {
    switch (w.kind) {
      case 'missing-layer':
        return (
          <>
            {source(w.from, `Go to ${where(w.from)}`, where(w.from))} uses layer {w.token}, which doesn't exist.
          </>
        );
      case 'unresolved':
        return (
          <>
            {w.tokens.join(', ')} {w.tokens.length === 1 ? 'is a layer name' : 'are layer names'} defined outside this keymap, so
            which layers you can reach isn't checked.
          </>
        );
      case 'unreachable':
        return (
          <>
            <strong>{layerName(w.layer)}</strong>: nothing turns it on.
          </>
        );
      case 'no-way-back':
        return (
          <>
            <strong>{layerName(w.layer)}</strong>: no way back. Once{' '}
            {w.entries.map((e, i) => (
              <span key={sourceKey(e.from)}>
                {i > 0 && ' or '}
                {source(e.from, `Go to ${where(e.from)}`, where(e.from))}
              </span>
            ))}{' '}
            turns it on, nothing on it turns it off or leads to another layer.
          </>
        );
      case 'base-trans':
        return (
          <>
            {w.keys.slice(0, BASE_TRANS_SHOWN).map((key, i) => (
              <span key={key}>
                {i > 0 && ' '}
                {source({ kind: 'key', layer: 0, key }, `Go to ${where({ kind: 'key', layer: 0, key })}`, `Key ${key}`)}
              </span>
            ))}
            {w.keys.length > BASE_TRANS_SHOWN && ` and ${w.keys.length - BASE_TRANS_SHOWN} more`} on {layerName(0)}{' '}
            {w.keys.length === 1 ? 'is' : 'are'} transparent, with no layer below: {w.keys.length === 1 ? 'it does' : 'they do'}{' '}
            nothing.
          </>
        );
    }
  };

  return (
    <Section
      variant="flat"
      title="Layers"
      label="Layer usage"
      icon="layers"
      description="What turns each layer on. Pick one to go to it."
    >
      {warnings.length === 0 ? (
        <p className="muted small">No layer problems found.</p>
      ) : (
        <ul className="layer-warnings" aria-label="Layer problems">
          {warnings.map((w) => (
            <li key={warningKey(w)} className="notice">
              {warningText(w)}
            </li>
          ))}
        </ul>
      )}
      <ul className="layer-usage">
        {keymap.layers.map((layer, index) => {
          const into = waysIn(refs, index);
          return (
            <li key={layer.uid ?? layer.name} aria-label={layerName(index)}>
              <span className="layer-usage-name">{layerName(index)}</span>
              {index === 0 ? (
                <span className="muted small">Always on</span>
              ) : into.length === 0 ? (
                <span className="muted small">Nothing turns it on</span>
              ) : (
                <div className="chips">
                  {into.map((r) => (
                    <Fragment key={`${sourceKey(r.from)}:${r.behavior}:${r.token}`}>{refChip(r)}</Fragment>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
