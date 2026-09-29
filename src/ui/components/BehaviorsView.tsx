import { useState, type Dispatch } from 'react';
import {
  createBehavior,
  deleteBehavior,
  renameBehavior,
  replaceBehavior,
  type NewBehaviorKind,
} from '../../core/keymap/behaviorEdit.ts';
import { behaviorKind, type KeymapModel } from '../../core/keymap/model.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { HelpLink } from '../help/HelpLink.tsx';
import { BehaviorEditor } from './behaviors/BehaviorEditor.tsx';
import { BehaviorList } from './behaviors/BehaviorList.tsx';
import { NewBehaviorDialog } from './behaviors/NewBehaviorDialog.tsx';
import { Icon } from './Icon.tsx';

interface BehaviorsViewProps {
  keymap: KeymapModel;
  /** `macro` lists macros; `behaviors` lists everything else. */
  kind: 'behaviors' | 'macros';
  selected: string | null;
  onSelect: (label: string | null) => void;
  dispatch: Dispatch<EditorAction>;
  /** Go to the Keymap tab with the palette on this section. */
  onShowInPalette: (section: string) => void;
}

/** Lists the keymap's behaviors (or macros) and edits the selected one. */
export function BehaviorsView({ keymap, kind, selected, onSelect, dispatch, onShowInPalette }: BehaviorsViewProps) {
  const [picking, setPicking] = useState(false);
  const isMacros = kind === 'macros';
  const list = keymap.behaviors.filter((b) => (behaviorKind(b) === 'macro') === isMacros);
  const behavior = list.find((b) => b.label === selected);
  const edit = (next: KeymapModel, notice?: string) =>
    dispatch(notice ? { type: 'edit', keymap: next, notice } : { type: 'edit', keymap: next });

  const add = (newKind: NewBehaviorKind) => {
    const created = createBehavior(keymap, newKind);
    edit({ ...keymap, behaviors: [...keymap.behaviors, created] });
    onSelect(created.label ?? null);
    setPicking(false);
  };
  const create = () => (isMacros ? add('macro') : setPicking(true));

  return (
    <div className="split behaviors-page">
      <div className="split-list">
        <div className="behaviors-list-head">
          <h2 className="panel-title">{isMacros ? 'Macros' : 'Behaviors'}</h2>
          <button
            type="button"
            className="button primary"
            aria-label={isMacros ? '+ New macro' : 'New behavior'}
            onClick={create}
          >
            <Icon name="plus" size={16} />
            {isMacros ? 'New macro' : 'New behavior'}
          </button>
        </div>
        <BehaviorList
          keymap={keymap}
          behaviors={list}
          macros={isMacros}
          selected={selected}
          onSelect={onSelect}
          onCreate={create}
        />
      </div>
      <div className="split-editor">
        {behavior?.label ? (
          <BehaviorEditor
            key={behavior.label}
            keymap={keymap}
            behavior={behavior}
            label={behavior.label}
            onChange={(next) => edit(replaceBehavior(keymap, behavior.label ?? '', next))}
            onRename={(to) => {
              edit(renameBehavior(keymap, behavior.label ?? '', to));
              onSelect(to);
            }}
            onDelete={() => {
              const { model, replaced } = deleteBehavior(keymap, behavior.label ?? '');
              edit(
                model,
                replaced > 0
                  ? `Deleted &${behavior.label}; ${replaced} binding${replaced > 1 ? 's' : ''} using it now do nothing.`
                  : undefined,
              );
              onSelect(null);
            }}
            onShowInPalette={onShowInPalette}
          />
        ) : (
          <div className="behavior-intro">
            <p className="muted">
              {isMacros
                ? 'Macros send a sequence of keys. Select one, or create a new one.'
                : 'Hold-taps do one thing when tapped and another when held; mod-morphs change with a modifier; encoder behaviors turn knobs into keys; tap-dances send something different for 1, 2, 3… taps. Select one, or create a new one.'}{' '}
              <HelpLink to={isMacros ? 'macros' : 'behaviors'} />
            </p>
          </div>
        )}
      </div>
      {!isMacros && <NewBehaviorDialog open={picking} onClose={() => setPicking(false)} onCreate={add} />}
    </div>
  );
}
