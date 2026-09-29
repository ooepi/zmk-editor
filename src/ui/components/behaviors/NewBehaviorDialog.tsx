import type { ReactNode } from 'react';
import type { NewBehaviorKind } from '../../../core/keymap/behaviorEdit.ts';
import { Icon } from '../Icon.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { KIND_LOOK } from './kinds.ts';

type Creatable = Exclude<NewBehaviorKind, 'macro'>;

const TYPES: {
  kind: Creatable;
  name: string;
  label: string;
  about: string;
  picture: ReactNode;
}[] = [
  {
    kind: 'hold-tap',
    name: 'Hold-tap',
    label: '+ Hold-tap',
    about: 'One key, two jobs: tap it for one thing, hold it for another. Home-row mods are hold-taps.',
    picture: (
      <span className="type-picture">
        <kbd className="mini-key split-key">
          <span>A</span>
          <span className="muted">⇧</span>
        </kbd>
        <span className="type-picture-note">tap · hold</span>
      </span>
    ),
  },
  {
    kind: 'mod-morph',
    name: 'Mod-morph',
    label: '+ Mod-morph',
    about: 'A key that changes when a modifier is held, like a comma that becomes a semicolon with Shift.',
    picture: (
      <span className="type-picture">
        <kbd className="mini-key">,</kbd>
        <span className="type-picture-note">⇧ →</span>
        <kbd className="mini-key">;</kbd>
      </span>
    ),
  },
  {
    kind: 'tap-dance',
    name: 'Tap-dance',
    label: '+ Tap-dance',
    about: 'Sends something different for one tap, two taps, three taps…',
    picture: (
      <span className="type-picture">
        <kbd className="mini-key">1×</kbd>
        <kbd className="mini-key">2×</kbd>
        <kbd className="mini-key">3×</kbd>
      </span>
    ),
  },
  {
    kind: 'sensor-rotate',
    name: 'Encoder',
    label: '+ Encoder behavior',
    about: 'Turns a knob into keys: one binding for each direction it turns.',
    picture: (
      <span className="type-picture">
        <Icon name="rotateCcw" size={16} />
        <span className="knob small" />
        <Icon name="rotateCw" size={16} />
      </span>
    ),
  },
];

interface NewBehaviorDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (kind: Creatable) => void;
}

/** Picks what kind of behavior to make, explaining each one. */
export function NewBehaviorDialog({ open, onClose, onCreate }: NewBehaviorDialogProps) {
  return (
    <Dialog open={open} title="New behavior" description="What should the key do?" onClose={onClose}>
      <div className="type-cards">
        {TYPES.map((t, i) => {
          const look = KIND_LOOK[t.kind];
          return (
            <button
              key={t.kind}
              type="button"
              className={`type-card kind-tone-${look.tone}`}
              aria-label={t.label}
              aria-describedby={`type-about-${t.kind}`}
              data-autofocus={i === 0 ? true : undefined}
              onClick={() => onCreate(t.kind)}
            >
              <span className="type-card-head">
                <span className="kind-disc">
                  <Icon name={look.icon} size={18} />
                </span>
                <strong>{t.name}</strong>
              </span>
              <span id={`type-about-${t.kind}`} className="type-card-about">
                {t.about}
              </span>
              {t.picture}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
