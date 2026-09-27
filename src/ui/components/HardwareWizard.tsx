import { useState, type Dispatch } from 'react';
import type { ZmkConfig } from '../../core/config.ts';
import { applyHardware, newHardwareConfig } from '../../core/hardware/config.ts';
import { basicsOf, DEFAULT_BASICS, gridHardware, type HardwareBasics } from '../../core/hardware/grid.ts';
import type { KeyboardHardware } from '../../core/hardware/types.ts';
import { hasErrors, validateBasics, validateHardware } from '../../core/hardware/validate.ts';
import { resizeMatrix } from '../../core/hardware/wiring.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { HardwareBasicsStep } from './HardwareBasicsStep.tsx';
import { HardwareLayoutStep } from './HardwareLayoutStep.tsx';
import { HardwareReviewStep } from './HardwareReviewStep.tsx';
import { HardwareWiringStep } from './HardwareWiringStep.tsx';

/** The keyboard being designed; `origins[i]` is key i's index before this edit (undefined for new keys). */
export interface HardwareDraft {
  hw: KeyboardHardware;
  origins: (number | undefined)[];
}

const STEPS = ['Basics', 'Wiring', 'Layout', 'Review'];

/** Changing these rebuilds the grid of a new keyboard. */
const shapeOf = (b: HardwareBasics) => `${b.split}|${b.rows}|${b.cols}|${b.wiring}`;

function anyPin(hw: KeyboardHardware): boolean {
  const w = hw.wiring;
  const pins = w.kind === 'direct' ? [...w.pins, ...(w.right ?? [])] : [...w.rows, ...w.cols, ...(w.right ? [...w.right.rows, ...w.right.cols] : [])];
  return pins.some((p) => p !== null);
}

function freshDraft(basics: HardwareBasics): HardwareDraft {
  const hw = gridHardware(basics);
  return { hw, origins: hw.keys.map(() => undefined) };
}

interface Props {
  config: ZmkConfig;
  dispatch: Dispatch<EditorAction>;
  mode: 'create' | 'edit';
  onDone: () => void;
  onCancel: () => void;
}

export function HardwareWizard({ config, dispatch, mode, onDone, onCancel }: Props) {
  // Frozen at mount: the wizard edits its own draft, so a config change behind it
  // (e.g. an undo/redo that slips through) must not retarget which keyboard this is.
  const [existing] = useState(() => (mode === 'edit' ? config.hardware : undefined));
  const [step, setStep] = useState(0);
  const [basics, setBasics] = useState<HardwareBasics>(() => (existing ? basicsOf(existing) : DEFAULT_BASICS));
  const [draft, setDraft] = useState<HardwareDraft>(() =>
    existing ? { hw: existing, origins: existing.keys.map((_, i) => i) } : freshDraft(DEFAULT_BASICS),
  );
  const [shape, setShape] = useState(() => shapeOf(basics));
  const basicsIssues = validateBasics(basics);
  const issues = validateHardware(draft.hw);

  const leaveBasics = () => {
    const { hw } = draft;
    if (!existing && shapeOf(basics) !== shape) {
      if (anyPin(hw) && !window.confirm('Changing the size or wiring starts the keys and pins over. Continue?')) return;
      setDraft(freshDraft(basics));
      setShape(shapeOf(basics));
    } else {
      let next: KeyboardHardware = { ...hw, name: basics.name, displayName: basics.displayName, controller: basics.controller };
      if (next.wiring.kind === 'matrix') {
        next = { ...next, wiring: { ...next.wiring, diodeDirection: basics.diodeDirection } };
        if (existing) next = resizeMatrix(next, basics.rows, basics.cols);
      }
      setDraft({ ...draft, hw: next });
    }
    setStep(1);
  };

  const finish = () => {
    if (existing) {
      const { config: next, notes } = applyHardware(config, draft.hw, draft.origins);
      dispatch({ type: 'editConfig', config: next, notice: ['Saved the keyboard’s hardware.', ...notes].join(' ') });
    } else {
      if (!window.confirm(`Start a new config for ${draft.hw.displayName}? This replaces what's in the editor (your repo is untouched until you commit).`)) return;
      dispatch({ type: 'load', config: newHardwareConfig(draft.hw, config.west.zmkVersion), warnings: [] });
    }
    onDone();
  };

  return (
    <div className="hardware-wizard">
      <h2 className="panel-title">{existing ? `Edit hardware · ${existing.displayName}` : 'Design your own keyboard'}</h2>
      <ol className="wizard-steps" aria-label="Steps">
        {STEPS.map((name, i) => (
          <li key={name} className={i === step ? 'active' : undefined} aria-current={i === step ? 'step' : undefined}>
            {i + 1}. {name}
          </li>
        ))}
      </ol>
      {step === 0 && <HardwareBasicsStep basics={basics} editing={Boolean(existing)} issues={basicsIssues} onChange={setBasics} />}
      {step === 1 && <HardwareWiringStep hw={draft.hw} issues={issues.filter((i) => i.area === 'wiring')} onChange={(hw) => setDraft({ ...draft, hw })} />}
      {step === 2 && <HardwareLayoutStep draft={draft} issues={issues.filter((i) => i.area === 'keys')} onChange={setDraft} />}
      {step === 3 && <HardwareReviewStep hw={draft.hw} issues={issues} />}
      <div className="row">
        <button type="button" className="button" onClick={step === 0 ? onCancel : () => setStep(step - 1)}>
          {step === 0 ? 'Cancel' : 'Back'}
        </button>
        {step < 3 ? (
          <button type="button" className="button primary" disabled={step === 0 && hasErrors(basicsIssues)} onClick={step === 0 ? leaveBasics : () => setStep(step + 1)}>
            Next
          </button>
        ) : (
          <button type="button" className="button primary" disabled={hasErrors(issues)} onClick={finish}>
            {existing ? 'Save hardware' : 'Create keyboard'}
          </button>
        )}
      </div>
    </div>
  );
}
