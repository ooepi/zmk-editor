import { useState, type CSSProperties } from 'react';
import { BUILTIN_BEHAVIORS } from '../../../core/catalog/behaviors.ts';
import { HOLD_TAP_PROPERTIES, readProperty, writeProperty, type PropertySchema } from '../../../core/catalog/properties.ts';
import type { Behavior } from '../../../core/keymap/model.ts';
import { Icon } from '../Icon.tsx';

/** Hold-tap bindings are behavior references without params, like `<&kp>, <&kp>`. */
const HOLD_TAP_REFS = BUILTIN_BEHAVIORS.filter((d) => d.params.length === 1 && (d.group === 'keys' || d.group === 'layers'));

const schema = (name: string) => HOLD_TAP_PROPERTIES.find((s) => s.name === name) as PropertySchema;
const FLAVOR = schema('flavor');
const TERM = schema('tapping-term-ms');
const QUICK_TAP = schema('quick-tap-ms');
const PRIOR_IDLE = schema('require-prior-idle-ms');

const FLAVORS: { value: string; name: string; about: string }[] = [
  {
    value: 'hold-preferred',
    name: 'Hold-preferred',
    about: 'Holds as soon as another key is pressed, or when the tapping term runs out.',
  },
  {
    value: 'balanced',
    name: 'Balanced',
    about: 'Holds if another key is pressed and released while it’s down, or when the tapping term runs out.',
  },
  {
    value: 'tap-preferred',
    name: 'Tap-preferred',
    about: 'Holds only when the tapping term runs out. Other keys don’t change that.',
  },
  {
    value: 'tap-unless-interrupted',
    name: 'Tap unless interrupted',
    about: 'Holds only if another key is pressed before the tapping term runs out; otherwise it taps.',
  },
];

/** The timing strip runs from 0 to this many ms; longer terms sit at the end. */
const STRIP_MS = 500;

const refName = (ref: string | undefined) => HOLD_TAP_REFS.find((d) => d.ref === ref)?.name ?? `&${ref ?? '?'}`;

interface HoldTapDiagramProps {
  behavior: Behavior;
  label: string;
  onChange: (behavior: Behavior) => void;
}

/** A key with Tap and Hold arms, a timing strip for the tapping term, and the flavor. */
export function HoldTapDiagram({ behavior, label, onChange }: HoldTapDiagramProps) {
  const read = (s: PropertySchema) => readProperty(behavior.properties, s);
  const write = (s: PropertySchema, value: string | number | undefined) =>
    onChange({
      ...behavior,
      properties: writeProperty(behavior.properties, s, value),
    });

  const term = read(TERM);
  // While the marker is dragged it moves on its own; the term is written once, on release.
  const [dragged, setDragged] = useState<number | null>(null);
  const termMs = dragged ?? (typeof term === 'number' ? term : (TERM.default as number));
  const commitDrag = () => {
    if (dragged === null) return;
    setDragged(null);
    if (dragged !== (term ?? TERM.default)) write(TERM, dragged);
  };
  const quickTap = read(QUICK_TAP);
  const priorIdle = read(PRIOR_IDLE);
  const flavorValue = read(FLAVOR);
  const flavor = typeof flavorValue === 'string' ? flavorValue : (FLAVOR.default as string);
  const pct = (ms: number) => `${(Math.min(Math.max(ms, 0), STRIP_MS) / STRIP_MS) * 100}%`;

  // Bindings are [hold, tap].
  const arm = (index: number, name: 'Tap' | 'Hold') => {
    const current = behavior.bindings[index]?.behavior;
    return (
      <label className={`ht-arm ht-arm-${name.toLowerCase()}`}>
        <span className="ht-arm-label">
          <Icon name={name === 'Tap' ? 'pointer' : 'hand'} size={14} />
          {name} →
        </span>
        <select
          className="input"
          aria-label={`${name} behavior`}
          value={current ?? ''}
          onChange={(e) =>
            onChange({
              ...behavior,
              bindings: behavior.bindings.with(index, {
                behavior: e.target.value,
                params: [],
              }),
            })
          }
        >
          {!HOLD_TAP_REFS.some((d) => d.ref === current) && <option value={current}>&amp;{current}</option>}
          {HOLD_TAP_REFS.map((d) => (
            <option key={d.ref} value={d.ref}>
              {d.name} (&amp;{d.ref})
            </option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <>
      <section className="diagram-card" aria-label="What it does">
        <div className="ht-diagram">
          <kbd className="big-key split-key" aria-hidden="true">
            <span className="big-key-name mono">&amp;{label}</span>
            <span>{refName(behavior.bindings[1]?.behavior)}</span>
            <span className="big-key-hold">{refName(behavior.bindings[0]?.behavior)}</span>
          </kbd>
          <div className="ht-arms">
            {arm(1, 'Tap')}
            {arm(0, 'Hold')}
          </div>
        </div>
        <p className="muted small">
          You choose the actual key and hold action where you put it on a key, e.g. &amp;{label} LSHIFT A.
        </p>
      </section>

      <section className="diagram-card" aria-labelledby="ht-timing-title">
        <div className="diagram-card-head">
          <h3 id="ht-timing-title" className="diagram-title">
            <Icon name="timer" size={16} /> Timing
          </h3>
          <label className="timing-value">
            <input
              className="input compact"
              type="number"
              min={0}
              aria-label="Tapping term (ms)"
              value={typeof term === 'number' ? term : ''}
              placeholder={String(TERM.default)}
              onChange={(e) => write(TERM, e.target.value === '' ? undefined : Number(e.target.value))}
            />
            <span className="muted small">ms</span>
          </label>
        </div>
        <div className="timing-strip" style={{ '--term': pct(termMs) } as CSSProperties}>
          <div className="timing-bar" aria-hidden="true">
            <span className="timing-zone tap">tap</span>
            <span className="timing-zone hold">hold</span>
          </div>
          <input
            className="timing-range"
            type="range"
            min={0}
            max={STRIP_MS}
            step={5}
            aria-label="Tapping term"
            aria-valuetext={`${termMs} ms`}
            value={Math.min(termMs, STRIP_MS)}
            onChange={(e) => setDragged(Number(e.target.value))}
            onPointerUp={commitDrag}
            onKeyUp={commitDrag}
            onBlur={commitDrag}
          />
          {typeof quickTap === 'number' && quickTap > 0 && (
            <div className="timing-extra" aria-hidden="true">
              <span className="timing-extra-zone" style={{ width: pct(quickTap) }} />
              <span className="timing-extra-label">Quick tap {quickTap} ms</span>
            </div>
          )}
          {typeof priorIdle === 'number' && priorIdle > 0 && (
            <div className="timing-extra" aria-hidden="true">
              <span className="timing-extra-zone" style={{ width: pct(priorIdle) }} />
              <span className="timing-extra-label">Prior idle {priorIdle} ms</span>
            </div>
          )}
          <div className="timing-ticks" aria-hidden="true">
            {[0, 100, 200, 300, 400, 500].map((ms) => (
              <span key={ms}>{ms}</span>
            ))}
          </div>
        </div>
        <p className="muted small">{TERM.help} Drag the marker, or type an exact value.</p>
      </section>

      <section className="diagram-card" aria-labelledby="ht-flavor-title">
        <h3 id="ht-flavor-title" className="diagram-title">
          Flavor
        </h3>
        <div className="segmented wrap" role="group" aria-label="Flavor">
          {FLAVORS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`segment${flavor === f.value ? ' active' : ''}`}
              aria-pressed={flavor === f.value}
              onClick={() => write(FLAVOR, f.value)}
            >
              {f.name}
            </button>
          ))}
        </div>
        <p className="muted small">
          {FLAVORS.find((f) => f.value === flavor)?.about ?? `Flavor: ${flavor}.`}
          {flavorValue === undefined && ' (ZMK’s default.)'}
        </p>
      </section>
    </>
  );
}
