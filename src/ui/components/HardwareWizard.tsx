import { useState, type Dispatch } from 'react';
import type { ZmkConfig } from '../../core/config.ts';
import { applyHardware, newHardwareConfig } from '../../core/hardware/config.ts';
import { addEncoder, carryEncoderOrigins, removeEncoder, sensorOrder } from '../../core/hardware/encoders.ts';
import { basicsOf, DEFAULT_BASICS, gridHardware, type HardwareBasics } from '../../core/hardware/grid.ts';
import type { KeyboardHardware } from '../../core/hardware/types.ts';
import { hasErrors, validateBasics, validateHardware } from '../../core/hardware/validate.ts';
import { halfEncoders, resizeMatrix } from '../../core/hardware/wiring.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { HardwareBasicsStep } from './HardwareBasicsStep.tsx';
import { HardwareLayoutStep } from './HardwareLayoutStep.tsx';
import { HardwareReviewStep } from './HardwareReviewStep.tsx';
import { HardwareWiringStep } from './HardwareWiringStep.tsx';

/** The keyboard being designed; `origins[i]` is key i's index before this edit (undefined for new keys). */
export interface HardwareDraft {
  hw: KeyboardHardware;
  origins: (number | undefined)[];
  /** Per encoder (in sensor order), its index before this edit (undefined for new encoders). */
  encoderOrigins: (number | undefined)[];
}

const STEPS = ['Basics', 'Wiring', 'Layout', 'Review'];

/** Changing these rebuilds the grid of a new keyboard. */
const shapeOf = (b: HardwareBasics) => `${b.split}|${b.rows}|${b.cols}|${b.wiring}`;

function anyPin(hw: KeyboardHardware): boolean {
  const w = hw.wiring;
  const pins = w.kind === 'direct' ? [...w.pins, ...(w.right ?? [])] : [...w.rows, ...w.cols, ...(w.right ? [...w.right.rows, ...w.right.cols] : [])];
  const encoderPins = [...halfEncoders(hw, 'left'), ...halfEncoders(hw, 'right')].flatMap((e) => [e.a, e.b]);
  if (encoderPins.some((p) => p !== null)) return true;
  return pins.some((p) => p !== null);
}

function freshDraft(basics: HardwareBasics): HardwareDraft {
  const hw = gridHardware(basics);
  return { hw, origins: hw.keys.map(() => undefined), encoderOrigins: [] };
}

/** Whether the keys still match a freshly generated grid of `hw`'s own shape, i.e. untouched. */
function keysMatchFreshGrid(hw: KeyboardHardware): boolean {
  const fresh = gridHardware(basicsOf(hw)).keys;
  return JSON.stringify(hw.keys) === JSON.stringify(fresh);
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
    existing
      ? { hw: existing, origins: existing.keys.map((_, i) => i), encoderOrigins: sensorOrder(existing).map((_, i) => i) }
      : freshDraft(DEFAULT_BASICS),
  );
  const [shape, setShape] = useState(() => shapeOf(basics));
  const basicsIssues = validateBasics(basics);
  const issues = validateHardware(draft.hw);

  const leaveBasics = () => {
    const { hw } = draft;
    if (!existing && shapeOf(basics) !== shape) {
      if ((anyPin(hw) || !keysMatchFreshGrid(hw)) && !window.confirm('Changing the size or wiring starts the keys and pins over. Continue?')) return;
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
      if (config.hardware !== existing) {
        dispatch({ type: 'notify', notice: 'The config changed while the wizard was open, so the hardware wasn’t saved. Open Edit hardware again.' });
        onCancel();
        return;
      }
      const { config: next, notes } = applyHardware(config, draft.hw, draft.origins, draft.encoderOrigins);
      dispatch({ type: 'editConfig', config: next, notice: ['Saved the keyboard’s hardware.', ...notes].join(' ') });
    } else {
      if (!window.confirm(`Start a new config for ${draft.hw.displayName}? This replaces what's in the editor (your repo is untouched until you commit).`)) return;
      dispatch({ type: 'load', config: newHardwareConfig(draft.hw, config.west.zmkVersion), warnings: [] });
    }
    onDone();
  };

  return (
    <div className={`hardware-wizard${step === 0 || step === 3 ? ' narrow' : ''}`}>
      <div className="wizard-head">
        <h2 className="panel-title">{existing ? `Edit hardware · ${existing.displayName}` : 'Design your own keyboard'}</h2>
        <ol className="wizard-steps" aria-label="Steps">
          {STEPS.map((name, i) => (
            <li key={name} className={i === step ? 'active' : i < step ? 'done' : undefined} aria-current={i === step ? 'step' : undefined}>
              {i < step ? (
                <button type="button" className="wizard-step-button" onClick={() => setStep(i)}>
                  {i + 1}. {name}
                </button>
              ) : (
                `${i + 1}. ${name}`
              )}
            </li>
          ))}
        </ol>
      </div>
      <section className="wizard-card" aria-label={STEPS[step]}>
        {step === 0 && <HardwareBasicsStep basics={basics} editing={Boolean(existing)} issues={basicsIssues} onChange={setBasics} />}
        {step === 1 && (
          <HardwareWiringStep
            hw={draft.hw}
            issues={issues.filter((i) => i.area === 'wiring')}
            onChange={(hw) => setDraft({ ...draft, hw, encoderOrigins: carryEncoderOrigins(draft.hw, hw, draft.encoderOrigins) })}
            onAddEncoder={(side) => {
              const next = addEncoder({ hw: draft.hw, origins: draft.encoderOrigins }, side);
              setDraft({ ...draft, hw: next.hw, encoderOrigins: next.origins });
            }}
            onRemoveEncoder={(side, index) => {
              const next = removeEncoder({ hw: draft.hw, origins: draft.encoderOrigins }, side, index);
              setDraft({ ...draft, hw: next.hw, encoderOrigins: next.origins });
            }}
          />
        )}
        {step === 2 && <HardwareLayoutStep draft={draft} issues={issues.filter((i) => i.area === 'keys')} onChange={setDraft} />}
        {step === 3 && <HardwareReviewStep hw={draft.hw} issues={issues} />}
      </section>
      <div className="wizard-footer">
        <button type="button" className="button" onClick={step === 0 ? onCancel : () => setStep(step - 1)}>
          {step === 0 ? 'Cancel' : 'Back'}
        </button>
        <span className="muted small">
          Step {step + 1} of {STEPS.length}
        </span>
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
